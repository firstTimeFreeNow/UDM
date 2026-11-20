package httpadapter

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/application"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Verifier func(context.Context, string) (string, error)
type APIHandler struct {
	mux     http.Handler
	origins []string
	service *application.Service
	verify  Verifier
}

func New(origins []string, service *application.Service, verify Verifier) *APIHandler {
	h := &APIHandler{origins: append([]string{}, origins...), service: service, verify: verify}
	mux := http.NewServeMux()
	h.mux = HandlerWithOptions(h, StdHTTPServerOptions{BaseRouter: mux, ErrorHandlerFunc: h.routeError})
	mux.HandleFunc("/", h.handleHTTP)
	return h
}
func route(method string, u *url.URL, body map[string]any) (application.Operation, error) {
	entry, ok := operationCatalog[method+" "+strings.TrimSuffix(u.Path, "/")]
	op := application.Operation{Action: entry.Action, Payload: body}
	if op.Payload == nil {
		op.Payload = map[string]any{}
	}
	if !ok {
		return op, domain.Failure("NOT_FOUND")
	}
	if method == http.MethodGet {
		if entry.View != "" {
			op.Payload = map[string]any{"view": entry.View, "memberId": u.Query().Get("memberId")}
			op.Fresh = u.Query().Get("fresh") == "1"
		}
		if entry.Action == "af.history" {
			offset := 0
			if v := u.Query().Get("offset"); v != "" {
				n, err := strconv.Atoi(v)
				if err != nil || n < 0 || n > 10000 {
					return op, domain.Failure("INVALID_REQUEST")
				}
				offset = n
			}
			op.Payload = map[string]any{"offset": offset}
		}
	}
	return op, nil
}
func (h *APIHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		h.handleHTTP(w, r)
		return
	}
	h.mux.ServeHTTP(w, r)
}
func (h *APIHandler) routeError(w http.ResponseWriter, r *http.Request, err error) {
	// The existing boundary handles malformed queries and preserves the JSON error envelope.
	h.handleHTTP(w, r)
}

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,80}$`)

func (s *APIHandler) handleHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.Header.Get("X-Request-Id")
	if id == "" {
		id = domain.NewID()
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Vary", "Origin")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	fail := func(err error, override ...int) {
		var api *domain.APIError
		if !errors.As(err, &api) {
			api = domain.Failure("INTERNAL_ERROR")
		}
		status := errorStatus(api)
		if len(override) > 0 {
			status = override[0]
		}
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{"version": 1, "requestId": id, "ok": false, "error": map[string]any{"code": api.Code, "outcomeUnknown": api.Unknown}})
	}
	origin := r.Header.Get("Origin")
	if origin != "" {
		allowed := false
		for _, value := range s.origins {
			if value == origin {
				allowed = true
			}
		}
		if !allowed {
			fail(domain.Failure("FORBIDDEN"))
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	if !requestIDPattern.MatchString(id) {
		id = ""
		fail(domain.Failure("INVALID_REQUEST"))
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
				fail(domain.Failure("INVALID_REQUEST"), http.StatusRequestEntityTooLarge)
			} else {
				fail(domain.Failure("INVALID_REQUEST"))
			}
			return
		}
		if len(raw) > 0 && (json.Unmarshal(raw, &body) != nil || body == nil) {
			fail(domain.Failure("INVALID_REQUEST"))
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
	if !application.Public(op.Action) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			fail(domain.Failure("AUTH_REQUIRED"))
			return
		}
		token = strings.TrimPrefix(header, "Bearer ")
		uid, e = s.verify(ctx, token)
		if e != nil {
			fail(e)
			return
		}
		if uid == "" {
			fail(domain.Failure("AUTH_REQUIRED"))
			return
		}
	}
	if e := validateRequestTypes(op.Action, op.Payload); e != nil {
		fail(domain.Failure("INVALID_REQUEST"))
		return
	}
	result, e := s.service.Execute(ctx, uid, token, id, op)
	if e != nil {
		fail(e)
		return
	}
	result.Data = wireData(result.Data)
	_ = json.NewEncoder(w).Encode(struct {
		Version   int    `json:"version"`
		RequestID string `json:"requestId"`
		OK        bool   `json:"ok"`
		application.Result
	}{1, id, true, result})
}

func errorStatus(err *domain.APIError) int {
	switch err.Code {
	case "AUTH_REQUIRED":
		return http.StatusUnauthorized
	case "FORBIDDEN":
		return http.StatusForbidden
	case "CONFIG_REQUIRED":
		return http.StatusServiceUnavailable
	case "BUSY":
		if err.Limited {
			return http.StatusTooManyRequests
		}
		return http.StatusServiceUnavailable
	case "NOT_FOUND":
		if err.Upstream {
			return http.StatusBadRequest
		}
		return http.StatusNotFound
	case "INVALID_RESPONSE", "UPSTREAM_UNAVAILABLE":
		return http.StatusBadGateway
	case "INTERNAL_ERROR":
		if err.Upstream {
			return http.StatusBadGateway
		}
		return http.StatusInternalServerError
	default:
		return http.StatusBadRequest
	}
}
