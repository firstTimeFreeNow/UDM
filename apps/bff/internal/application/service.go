package application

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
	"sync"
	"time"
)

const TTL = 5 * time.Minute

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
type Service struct {
	send     Sender
	now      func() time.Time
	gate     chan struct{}
	cache    Cache
	authMu   sync.Mutex
	sessions map[string]session
	loads    map[string]*sessionLoad
	rateMu   sync.Mutex
	rates    map[string]rate
}
type Sender func(context.Context, string, map[string]any, string, string) (json.RawMessage, error)

func New(send Sender, cache Cache, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{send: send, now: now, gate: make(chan struct{}, 1), cache: cache, sessions: map[string]session{}, loads: map[string]*sessionLoad{}, rates: map[string]rate{}}
}
func (s *Service) limit(key string, maxCount int) error {
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
			return &domain.APIError{Code: "BUSY", Limited: true}
		}
	}
	r.count++
	s.rates[key] = r
	if r.count > maxCount {
		return &domain.APIError{Code: "BUSY", Limited: true}
	}
	return nil
}
func (s *Service) authorize(ctx context.Context, uid, token, id string, op Operation) (string, error) {
	if Public(op.Action) {
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
			return "", domain.Failure("BUSY")
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
		err = domain.Failure("FORBIDDEN")
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
	if (!Participant(op.Action) || StringValue(op.Payload["view"]) == "admin") && role != "admin" {
		return "", domain.Failure("FORBIDDEN")
	}
	return role, nil
}
func (s *Service) meta(at time.Time, revision string) *Meta {
	end := at.Add(TTL)
	return &Meta{at.UnixMilli(), end.UnixMilli(), max(int64(0), end.Sub(s.now()).Milliseconds()), revision}
}
func (s *Service) locked(ctx context.Context) error {
	select {
	case s.gate <- struct{}{}:
		return nil
	case <-ctx.Done():
		return domain.Failure("BUSY")
	}
}
func (s *Service) unlock() { <-s.gate }
func (s *Service) Execute(ctx context.Context, uid, token, id string, op Operation) (Result, error) {
	key := "user:" + uid
	maxRate := 90
	if Public(op.Action) {
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
	if op.Action == "af.read" || Mutation(op.Action) || op.Action == "af.history" {
		if e := s.locked(ctx); e != nil {
			return Result{}, e
		}
		defer s.unlock()
		if op.Action == "af.read" {
			if s.cache.Schedule() == nil || !s.cache.Schedule().At.Add(TTL).After(s.now()) || op.Fresh {
				at := s.now()
				raw, e := s.send(ctx, "af.read", map[string]any{}, token, id)
				if e != nil {
					return Result{}, e
				}
				state, e := domain.ParseSchedule(raw)
				if e != nil {
					return Result{}, e
				}
				if s.cache.Schedule() == nil || state.WeekID != s.cache.Schedule().State.WeekID {
					s.cache.ClearHistory()
				}
				s.cache.SetSchedule(&Snapshot{state, at, domain.NewID()})
			}
			view := StringValue(op.Payload["view"])
			if view == "" {
				view = "schedule"
			}
			data, e := domain.Project(s.cache.Schedule().State, view, StringValue(op.Payload["memberId"]))
			return Result{data, s.meta(s.cache.Schedule().At, s.cache.Schedule().Revision)}, e
		}
		if Mutation(op.Action) {
			at := s.now()
			raw, err := s.send(ctx, op.Action, op.Payload, token, id)
			var wrapper map[string]json.RawMessage
			var state *domain.Schedule
			if err == nil {
				source := raw
				if op.Action == "af.answers.save" {
					if json.Unmarshal(raw, &wrapper) != nil {
						err = domain.Failure("INVALID_RESPONSE")
					} else {
						source = wrapper["state"]
					}
				}
				if err == nil {
					state, err = domain.ParseSchedule(source)
				}
			}
			if err != nil {
				s.cache.SetSchedule(nil)
				s.cache.ClearHistory()
				var api *domain.APIError
				if !errors.As(err, &api) || api.Code == "INVALID_RESPONSE" {
					return Result{}, &domain.APIError{Code: "INVALID_RESPONSE", Unknown: true}
				}
				if api.Code == "FORBIDDEN" || api.Code == "AUTH_REQUIRED" {
					s.authMu.Lock()
					delete(s.sessions, uid)
					s.authMu.Unlock()
				}
				return Result{}, err
			}
			s.cache.SetSchedule(&Snapshot{state, at, domain.NewID()})
			s.cache.ClearHistory()
			view := "admin"
			if op.Action == "af.answers.save" {
				view = "answer"
			}
			data, e := domain.Project(state, view, StringValue(op.Payload["memberId"]))
			if e != nil {
				s.cache.SetSchedule(nil)
				return Result{}, &domain.APIError{Code: "INVALID_RESPONSE", Unknown: true}
			}
			var value any = data
			if op.Action == "af.answers.save" {
				encoded, _ := json.Marshal(data)
				wrapper["state"] = encoded
				value = wrapper
			}
			return Result{value, s.meta(at, s.cache.Schedule().Revision)}, nil
		}
		offset, _ := op.Payload["offset"].(int)
		entry, ok := s.cache.History(offset)
		if !ok || !entry.At.Add(TTL).After(s.now()) {
			if offset == 0 {
				s.cache.ClearHistory()
			}
			at := s.now()
			raw, e := s.send(ctx, op.Action, op.Payload, token, id)
			if e != nil {
				return Result{}, e
			}
			if !validHistory(raw) {
				return Result{}, domain.Failure("INVALID_RESPONSE")
			}
			entry = HistoryEntry{raw, at, domain.NewID()}
			if s.cache.HistorySize() >= 50 {
				s.cache.ClearHistory()
			}
			s.cache.SetHistory(offset, entry)
		}
		return Result{entry.Data, s.meta(entry.At, entry.Revision)}, nil
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
		if !domain.ValidDay(i.WeekID) || i.Status == nil || (i.Confirmed != nil && !domain.ValidSlot(*i.Confirmed)) {
			return false
		}
	}
	return true
}
