package bff

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Meta struct {
	Fetched   int64  `json:"sourceFetchedAt"`
	Expires   int64  `json:"expiresAt"`
	Remaining int64  `json:"remainingTtlMs"`
	Revision  string `json:"revision"`
}
type Result struct {
	Data any   `json:"data"`
	Meta *Meta `json:"meta,omitempty"`
}
type snapshot struct {
	state    *Schedule
	at       time.Time
	revision string
}
type historyEntry struct {
	data     json.RawMessage
	at       time.Time
	revision string
}
type session struct {
	role  string
	until time.Time
}
type sessionLoad struct {
	done  chan struct{}
	value session
	err   error
}
type rate struct {
	start time.Time
	count int
}
type Server struct {
	cfg      Config
	send     Sender
	verify   Verifier
	now      func() time.Time
	gate     chan struct{}
	state    *snapshot
	history  map[int]historyEntry
	authMu   sync.Mutex
	sessions map[string]session
	loads    map[string]*sessionLoad
	rateMu   sync.Mutex
	rates    map[string]rate
}
type Options struct {
	Send   Sender
	Verify Verifier
	Now    func() time.Time
	Client *http.Client
}

func New(cfg Config, options Options) (*Server, error) {
	if e := cfg.Validate(); e != nil {
		return nil, e
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	client := options.Client
	if client == nil {
		client = &http.Client{Timeout: 26 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 10 || r.URL.Scheme != "https" || (r.URL.Host != "script.google.com" && r.URL.Host != "script.googleusercontent.com") {
				return errors.New("unexpected redirect")
			}
			return nil
		}}
	}
	send := options.Send
	if send == nil {
		send = newUpstream(cfg, client)
	}
	verify := options.Verify
	if verify == nil {
		v := &tokenVerifier{project: cfg.Project, client: client, now: now}
		verify = v.Verify
	}
	return &Server{cfg: cfg, send: send, verify: verify, now: now, gate: make(chan struct{}, 1), history: map[int]historyEntry{}, sessions: map[string]session{}, loads: map[string]*sessionLoad{}, rates: map[string]rate{}}, nil
}
func (s *Server) limit(key string, maxCount int) error {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	now := s.now()
	r := s.rates[key]
	if r.start.IsZero() || !r.start.Add(time.Minute).After(now) {
		r = rate{start: now}
	}
	if len(s.rates) >= 1024 {
		for k, v := range s.rates {
			if !v.start.Add(time.Minute).After(now) {
				delete(s.rates, k)
			}
		}
		if _, ok := s.rates[key]; !ok && len(s.rates) >= 1024 {
			return failure("BUSY", 429)
		}
	}
	r.count++
	s.rates[key] = r
	if r.count > maxCount {
		return failure("BUSY", 429)
	}
	return nil
}
func (s *Server) authorize(ctx context.Context, uid, token, id string, op Operation) (string, error) {
	if public(op.Action) {
		return "", nil
	}
	s.authMu.Lock()
	cached, ok := s.sessions[uid]
	if ok && cached.until.After(s.now()) {
		s.authMu.Unlock()
		return checkRole(cached.role, op)
	}
	load, exists := s.loads[uid]
	if !exists {
		load = &sessionLoad{done: make(chan struct{})}
		s.loads[uid] = load
	}
	s.authMu.Unlock()
	if exists {
		select {
		case <-ctx.Done():
			return "", failure("BUSY", 503)
		case <-load.done:
			if load.err != nil {
				return "", load.err
			}
			return checkRole(load.value.role, op)
		}
	}
	raw, err := s.send(ctx, "af.session", map[string]any{}, token, id)
	var value struct {
		Role string `json:"role"`
	}
	if err == nil && (json.Unmarshal(raw, &value) != nil || (value.Role != "participant" && value.Role != "admin")) {
		err = failure("FORBIDDEN", 403)
	}
	s.authMu.Lock()
	load.value = session{role: value.Role, until: s.now().Add(time.Minute)}
	load.err = err
	if err == nil {
		if len(s.sessions) >= 128 {
			for key, v := range s.sessions {
				if !v.until.After(s.now()) {
					delete(s.sessions, key)
				}
			}
		}
		if len(s.sessions) < 128 {
			s.sessions[uid] = load.value
		}
	}
	delete(s.loads, uid)
	close(load.done)
	s.authMu.Unlock()
	if err != nil {
		return "", err
	}
	return checkRole(value.Role, op)
}
func checkRole(role string, op Operation) (string, error) {
	if (!participant(op.Action) || stringValue(op.Payload["view"]) == "admin") && role != "admin" {
		return "", failure("FORBIDDEN", 403)
	}
	return role, nil
}
func (s *Server) meta(at time.Time, revision string) *Meta {
	end := at.Add(TTL)
	return &Meta{at.UnixMilli(), end.UnixMilli(), max(int64(0), end.Sub(s.now()).Milliseconds()), revision}
}
func (s *Server) locked(ctx context.Context) error {
	select {
	case s.gate <- struct{}{}:
		return nil
	case <-ctx.Done():
		return failure("BUSY", 503)
	}
}
func (s *Server) unlock() { <-s.gate }
func (s *Server) handle(ctx context.Context, uid, token, id string, op Operation) (Result, error) {
	key := "user:" + uid
	maxRate := 90
	if public(op.Action) {
		key = "public:" + op.Action
		maxRate = 30
	}
	if e := s.limit(key, maxRate); e != nil {
		return Result{}, e
	}
	role, e := s.authorize(ctx, uid, token, id, op)
	if e != nil {
		return Result{}, e
	}
	if op.Action == "af.session" {
		return Result{Data: map[string]string{"role": role}}, nil
	}
	if op.Action == "af.read" || mutation(op.Action) || op.Action == "af.history" {
		if e := s.locked(ctx); e != nil {
			return Result{}, e
		}
		defer s.unlock()
		if op.Action == "af.read" {
			if s.state == nil || !s.state.at.Add(TTL).After(s.now()) || op.Fresh {
				at := s.now()
				raw, e := s.send(ctx, "af.read", map[string]any{}, token, id)
				if e != nil {
					return Result{}, e
				}
				state, e := parseSchedule(raw)
				if e != nil {
					return Result{}, e
				}
				if s.state == nil || state.WeekID != s.state.state.WeekID {
					clear(s.history)
				}
				s.state = &snapshot{state, at, uuid()}
			}
			view := stringValue(op.Payload["view"])
			if view == "" {
				view = "schedule"
			}
			data, e := project(s.state.state, view, stringValue(op.Payload["memberId"]))
			return Result{data, s.meta(s.state.at, s.state.revision)}, e
		}
		if mutation(op.Action) {
			at := s.now()
			raw, err := s.send(ctx, op.Action, op.Payload, token, id)
			var wrapper map[string]json.RawMessage
			var state *Schedule
			if err == nil {
				source := raw
				if op.Action == "af.answers.save" {
					if json.Unmarshal(raw, &wrapper) != nil {
						err = failure("INVALID_RESPONSE", 502)
					} else {
						source = wrapper["state"]
					}
				}
				if err == nil {
					state, err = parseSchedule(source)
				}
			}
			if err != nil {
				s.state = nil
				clear(s.history)
				var api *APIError
				if !errors.As(err, &api) || api.Code == "INVALID_RESPONSE" {
					return Result{}, &APIError{"INVALID_RESPONSE", 502, true}
				}
				if api.Code == "FORBIDDEN" || api.Code == "AUTH_REQUIRED" {
					s.authMu.Lock()
					delete(s.sessions, uid)
					s.authMu.Unlock()
				}
				return Result{}, err
			}
			s.state = &snapshot{state, at, uuid()}
			clear(s.history)
			view := "admin"
			if op.Action == "af.answers.save" {
				view = "answer"
			}
			data, e := project(state, view, stringValue(op.Payload["memberId"]))
			if e != nil {
				s.state = nil
				return Result{}, &APIError{"INVALID_RESPONSE", 502, true}
			}
			var value any = data
			if op.Action == "af.answers.save" {
				encoded, _ := json.Marshal(data)
				wrapper["state"] = encoded
				value = wrapper
			}
			return Result{value, s.meta(at, s.state.revision)}, nil
		}
		offset, _ := op.Payload["offset"].(int)
		entry, ok := s.history[offset]
		if !ok || !entry.at.Add(TTL).After(s.now()) {
			if offset == 0 {
				clear(s.history)
			}
			at := s.now()
			raw, e := s.send(ctx, op.Action, op.Payload, token, id)
			if e != nil {
				return Result{}, e
			}
			if !validHistory(raw) {
				return Result{}, failure("INVALID_RESPONSE", 502)
			}
			entry = historyEntry{raw, at, uuid()}
			if len(s.history) >= 50 {
				clear(s.history)
			}
			s.history[offset] = entry
		}
		return Result{entry.data, s.meta(entry.at, entry.revision)}, nil
	}
	raw, e := s.send(ctx, op.Action, op.Payload, token, id)
	return Result{Data: raw}, e
}
func validHistory(raw json.RawMessage) bool {
	var h struct {
		Items []struct {
			WeekID    string  `json:"weekId"`
			Confirmed *string `json:"confirmed"`
			Status    *string `json:"status"`
		} `json:"items"`
		Offset *int `json:"nextOffset"`
	}
	if json.Unmarshal(raw, &h) != nil || h.Items == nil || len(h.Items) > 12 || (h.Offset != nil && *h.Offset < 0) {
		return false
	}
	for _, i := range h.Items {
		if !validDay(i.WeekID) || i.Status == nil || (i.Confirmed != nil && !validSlot(*i.Confirmed)) {
			return false
		}
	}
	return true
}

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,80}$`)

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.Header.Get("X-Request-Id")
	if id == "" {
		id = uuid()
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Vary", "Origin")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	fail := func(err error) {
		var api *APIError
		if !errors.As(err, &api) {
			api = failure("INTERNAL_ERROR", 500)
		}
		w.WriteHeader(api.Status)
		_ = json.NewEncoder(w).Encode(map[string]any{"version": 1, "requestId": id, "ok": false, "error": map[string]any{"code": api.Code, "outcomeUnknown": api.Unknown}})
	}
	origin := r.Header.Get("Origin")
	if origin != "" {
		allowed := false
		for _, value := range s.cfg.Origins {
			if value == origin {
				allowed = true
			}
		}
		if !allowed {
			fail(failure("FORBIDDEN", 403))
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	if !requestIDPattern.MatchString(id) {
		id = ""
		fail(failure("INVALID_REQUEST", 400))
		return
	}
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id")
		w.Header().Set("Access-Control-Max-Age", "600")
		w.WriteHeader(204)
		return
	}
	if r.Method == http.MethodGet && r.URL.Path == "/health" {
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
		return
	}
	body := map[string]any{}
	if r.Method != http.MethodGet {
		r.Body = http.MaxBytesReader(w, r.Body, 64000)
		raw, e := io.ReadAll(r.Body)
		if e != nil {
			var tooBig *http.MaxBytesError
			if errors.As(e, &tooBig) {
				fail(failure("INVALID_REQUEST", 413))
			} else {
				fail(failure("INVALID_REQUEST", 400))
			}
			return
		}
		if len(raw) > 0 && (json.Unmarshal(raw, &body) != nil || body == nil) {
			fail(failure("INVALID_REQUEST", 400))
			return
		}
	}
	op, e := route(r.Method, r.URL, body)
	if e != nil {
		fail(e)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
	defer cancel()
	uid, token := "", ""
	if !public(op.Action) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			fail(failure("AUTH_REQUIRED", 401))
			return
		}
		token = strings.TrimPrefix(header, "Bearer ")
		uid, e = s.verify(ctx, token)
		if e != nil {
			fail(e)
			return
		}
		if uid == "" {
			fail(failure("AUTH_REQUIRED", 401))
			return
		}
	}
	result, e := s.handle(ctx, uid, token, id, op)
	if e != nil {
		fail(e)
		return
	}
	_ = json.NewEncoder(w).Encode(struct {
		Version   int    `json:"version"`
		RequestID string `json:"requestId"`
		OK        bool   `json:"ok"`
		Result
	}{1, id, true, result})
}
