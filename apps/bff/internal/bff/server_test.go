package bff

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const memberA = "m_00000000-0000-0000-0000-000000000001"
const memberB = "m_00000000-0000-0000-0000-000000000002"
const slot = "2026-11-16 21:30"

func stateFixture() json.RawMessage {
	return json.RawMessage(`{"weekId":"2026-11-16","confirmed":null,"minParticipants":6,"maxParticipants":8,"members":[{"id":"` + memberA + `","name":"A","required":true},{"id":"` + memberB + `","name":"B","required":false}],"slots":[{"key":"` + slot + `","date":"2026-11-16","time":"21:30","count":1,"judgment":"人数不足"}],"answers":{"` + memberA + `":{"` + slot + `":"○"},"` + memberB + `":{"` + slot + `":"×"}}}`)
}
func configFixture() Config {
	return Config{Project: "fixture-project", SharedSecret: strings.Repeat("b", 64), UpstreamURL: "https://script.google.com/macros/s/fixture/exec", Origins: []string{"https://site.example"}}
}
func serverFixture(t *testing.T, send Sender, now func() time.Time) *Server {
	t.Helper()
	s, e := New(configFixture(), Options{Send: send, Now: now, Verify: func(_ context.Context, token string) (string, error) {
		if token == "admin" || token == "member" {
			return token, nil
		}
		return "", failure("AUTH_REQUIRED", 401)
	}})
	if e != nil {
		t.Fatal(e)
	}
	return s
}
func respond(send Sender) Sender {
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
func op(view string) Operation {
	return Operation{Action: "af.read", Payload: map[string]any{"view": view, "memberId": memberA}}
}
func call(s *Server, operation Operation) (Result, error) {
	return s.handle(context.Background(), "member", "member", uuid(), operation)
}
func TestSharedCacheTTLAndProjection(t *testing.T) {
	var reads atomic.Int32
	var nanos atomic.Int64
	nanos.Store(time.Now().UnixNano())
	s := serverFixture(t, respond(func(context.Context, string, map[string]any, string, string) (json.RawMessage, error) {
		reads.Add(1)
		return stateFixture(), nil
	}), func() time.Time { return time.Unix(0, nanos.Load()) })
	var wg sync.WaitGroup
	for range 16 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, e := call(s, op("answer"))
			if e != nil {
				t.Error(e)
				return
			}
			p := r.Data.(*Schedule)
			if len(p.Answers[memberB]) != 0 || p.Answers[memberA][slot] != "○" {
				t.Error("answer projection leaked or lost data")
			}
		}()
	}
	wg.Wait()
	if reads.Load() != 1 {
		t.Fatal("duplicate sheet reads", reads.Load())
	}
	nanos.Add(int64(2 * time.Minute))
	r, e := call(s, op("schedule"))
	if e != nil {
		t.Fatal(e)
	}
	if r.Meta.Remaining != 180000 || len(r.Data.(*Schedule).Members) != 0 || len(r.Data.(*Schedule).Answers) != 0 {
		t.Fatal("TTL extended or overview leaked members")
	}
	nanos.Add(int64(3 * time.Minute))
	if _, e = call(s, op("schedule")); e != nil {
		t.Fatal(e)
	}
	if reads.Load() != 2 {
		t.Fatal("expired cache reused")
	}
	fresh := op("schedule")
	fresh.Fresh = true
	_, e = call(s, fresh)
	if e != nil || reads.Load() != 3 {
		t.Fatal("manual refresh did not reach sheet")
	}
}
func TestAuthorizationPrecedesCachedAdminData(t *testing.T) {
	s := serverFixture(t, respond(func(context.Context, string, map[string]any, string, string) (json.RawMessage, error) {
		return stateFixture(), nil
	}), nil)
	result, e := s.handle(context.Background(), "admin", "admin", uuid(), op("admin"))
	if e != nil {
		t.Fatal(e)
	}
	if result.Data.(*Schedule).Slots[0].HasAnswers == nil || !*result.Data.(*Schedule).Slots[0].HasAnswers {
		t.Fatal("missing deletion flags")
	}
	_, e = call(s, op("admin"))
	var api *APIError
	if !errors.As(e, &api) || api.Code != "FORBIDDEN" {
		t.Fatal("cached admin data exposed")
	}
}
func TestReadsAndWritesAreSerializedAndAmbiguousWritesInvalidate(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var reads, writes atomic.Int32
	s := serverFixture(t, respond(func(_ context.Context, action string, _ map[string]any, _ string, _ string) (json.RawMessage, error) {
		if action == "af.read" {
			if reads.Add(1) == 1 {
				close(started)
				<-release
			}
			return stateFixture(), nil
		}
		writes.Add(1)
		return nil, &APIError{"UPSTREAM_UNAVAILABLE", 502, true}
	}), nil)
	done := make(chan error, 1)
	go func() { _, e := call(s, op("schedule")); done <- e }()
	<-started
	written := make(chan error, 1)
	go func() {
		_, e := call(s, Operation{Action: "af.answers.save", Payload: map[string]any{"memberId": memberA}})
		written <- e
	}()
	if writes.Load() != 0 {
		t.Fatal("write overtook read")
	}
	close(release)
	if e := <-done; e != nil {
		t.Fatal(e)
	}
	e := <-written
	var api *APIError
	if !errors.As(e, &api) || !api.Unknown || writes.Load() != 1 {
		t.Fatal("ambiguous write retried or acknowledged", e)
	}
	if _, e = call(s, op("schedule")); e != nil {
		t.Fatal(e)
	}
	if reads.Load() != 2 {
		t.Fatal("ambiguous write retained stale cache")
	}
}
func TestWritePopulatesCacheAndStripsOtherAnswers(t *testing.T) {
	var reads atomic.Int32
	s := serverFixture(t, respond(func(_ context.Context, action string, _ map[string]any, _ string, _ string) (json.RawMessage, error) {
		if action == "af.read" {
			reads.Add(1)
			return stateFixture(), nil
		}
		return json.RawMessage(`{"saved":true,"savedCount":1,"state":` + string(stateFixture()) + `}`), nil
	}), nil)
	result, e := call(s, Operation{Action: "af.answers.save", Payload: map[string]any{"memberId": memberA}})
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := json.Marshal(result.Data)
	var saved struct {
		State Schedule `json:"state"`
	}
	json.Unmarshal(raw, &saved)
	if len(saved.State.Answers[memberB]) != 0 {
		t.Fatal("save leaked answers")
	}
	if _, e = call(s, op("answer")); e != nil || reads.Load() != 0 {
		t.Fatal("save cache was not reused", e)
	}
}
func TestHTTPBoundary(t *testing.T) {
	var sends atomic.Int32
	s := serverFixture(t, respond(func(context.Context, string, map[string]any, string, string) (json.RawMessage, error) {
		sends.Add(1)
		return json.RawMessage(`{"ready":true,"enabled":false}`), nil
	}), nil)
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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestUpstreamSignatureAndUnknownWrite(t *testing.T) {
	cfg := configFixture()
	var calls int
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		raw, _ := io.ReadAll(r.Body)
		var request map[string]any
		if json.Unmarshal(raw, &request) != nil {
			t.Fatal("invalid envelope")
		}
		bff := request["bff"].(map[string]any)
		sig := bff["signature"]
		delete(request, "bff")
		request["issuedAt"] = bff["issuedAt"]
		request["nonce"] = bff["nonce"]
		expected, _ := signRequest(request, cfg.SharedSecret)
		if sig != expected {
			t.Fatal("invalid signature")
		}
		if r.URL.String() != cfg.UpstreamURL || r.Header.Get("Authorization") != "" {
			t.Fatal("wrong credential transport")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/html"}}, Body: io.NopCloser(strings.NewReader("private raw output"))}, nil
	})}
	_, e := newUpstream(cfg, client)(context.Background(), "af.answers.save", map[string]any{}, "private-token", uuid())
	var api *APIError
	if !errors.As(e, &api) || !api.Unknown || calls != 1 {
		t.Fatal("write failure not ambiguous or retried", e)
	}
}
func TestCanonicalUnicodeAndLiteralEscapes(t *testing.T) {
	value := map[string]any{"name": "<>&\u2028\u2029", "literal": `\u2028\u2029`}
	raw, e := canonical(value)
	if e != nil || !json.Valid(raw) {
		t.Fatal("invalid canonical JSON", string(raw))
	}
	var round map[string]any
	json.Unmarshal(raw, &round)
	if round["literal"] != value["literal"] || strings.Contains(string(raw), `\u003c`) {
		t.Fatal("canonical JSON changed strings")
	}
}
func TestInvalidUpstreamScheduleNeverAcknowledgesWrite(t *testing.T) {
	s := serverFixture(t, respond(func(context.Context, string, map[string]any, string, string) (json.RawMessage, error) {
		return json.RawMessage(`{"saved":true,"state":{}}`), nil
	}), nil)
	_, e := call(s, Operation{Action: "af.answers.save", Payload: map[string]any{}})
	var api *APIError
	if !errors.As(e, &api) || !api.Unknown {
		t.Fatal("malformed write acknowledged")
	}
}

func TestCrossLanguageHMACFixture(t *testing.T) {
	raw, e := os.ReadFile("testdata/hmac.json")
	if e != nil {
		t.Fatal(e)
	}
	var f struct {
		Secret    string         `json:"secret"`
		Request   map[string]any `json:"request"`
		Canonical string         `json:"canonical"`
		Signature string         `json:"signature"`
	}
	if json.Unmarshal(raw, &f) != nil {
		t.Fatal("invalid fixture")
	}
	b := f.Request["bff"].(map[string]any)
	delete(f.Request, "bff")
	f.Request["issuedAt"] = b["issuedAt"]
	f.Request["nonce"] = b["nonce"]
	canonical, e := canonical(f.Request)
	if e != nil || string(canonical) != f.Canonical {
		t.Fatalf("Apps Script canonical JSON mismatch: %s", canonical)
	}
	signature, e := signRequest(f.Request, f.Secret)
	if e != nil || signature != f.Signature {
		t.Fatal("HMAC differs from WebCrypto fixture")
	}
}

func TestMissingRequiredUpstreamFieldsAreRejected(t *testing.T) {
	for _, changed := range []string{strings.Replace(string(stateFixture()), `"confirmed":null,`, "", 1), strings.Replace(string(stateFixture()), `"required":true`, `"required":null`, 1), strings.Replace(string(stateFixture()), `"count":1`, `"count":null`, 1), strings.Replace(string(stateFixture()), `"name":"A"`, `"name":null`, 1)} {
		if _, e := parseSchedule(json.RawMessage(changed)); e == nil {
			t.Fatal("missing or null field accepted")
		}
	}
}
