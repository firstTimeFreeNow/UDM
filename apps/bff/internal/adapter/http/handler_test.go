package httpadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/adapter/cache"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/application"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/config"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func respond(send application.Sender) application.Sender {
	return func(ctx context.Context, action string, payload map[string]any, token, id string) (json.RawMessage, error) {
		if action == "af.session" {
			role := "participant"
			if token == "admin" {
				role = "admin"
			}
			return json.Marshal(map[string]string{"role": role})
		}
		return send(ctx, action, payload, token, id)
	}
}
func configFixture() config.Config {
	return config.Config{Project: "fixture-project", SharedSecret: strings.Repeat("b", 64), UpstreamURL: "https://script.google.com/macros/s/fixture/exec", Origins: []string{"https://site.example"}}
}
func TestHTTPBoundary(t *testing.T) {
	var sends atomic.Int32
	service := application.New(respond(func(context.Context, string, map[string]any, string, string) (json.RawMessage, error) {
		sends.Add(1)
		return json.RawMessage(`{"ready":true,"enabled":false}`), nil
	}), cache.New(), nil)
	s := New(configFixture().Origins, service, func(_ context.Context, token string) (string, error) { return token, nil })
	cases := []struct {
		method, path, origin, token, body string
		status                            int
	}{{"GET", "/health", "https://site.example", "", "", 200}, {"GET", "/v1/session", "https://site.example", "", "", 401}, {"GET", "/v1/session", "https://evil.example", "admin", "", 403}, {"GET", "/unknown", "", "", "", 404}, {"POST", "/v1/afetiria-extra/push/status", "https://site.example", "", "{}", 200}, {"POST", "/v1/afetiria-extra/push/test", "https://site.example", "member", "{}", 403}, {"POST", "/v1/afetiria-extra/push/status", "", "", "null", 400}, {"POST", "/v1/afetiria-extra/push/status", "", "", "[]", 400}, {"POST", "/v1/afetiria-extra/push/status", "", "", strings.Repeat("x", 64001), 413}, {"OPTIONS", "/v1/afetiria-extra/answers", "https://site.example", "", "", 204}}
	for _, c := range cases {
		t.Run(fmt.Sprintf("%s_%s_%d", c.method, c.path, c.status), func(t *testing.T) {
			r := httptest.NewRequest(c.method, c.path, strings.NewReader(c.body))
			if c.origin != "" {
				r.Header.Set("Origin", c.origin)
			}
			if c.token != "" {
				r.Header.Set("Authorization", "Bearer "+c.token)
			}
			w := httptest.NewRecorder()
			s.ServeHTTP(w, r)
			if w.Code != c.status {
				t.Fatalf("%d: %s", w.Code, w.Body.String())
			}
			if strings.Contains(w.Body.String(), "private") {
				t.Fatal("raw error leaked")
			}
		})
	}
}
