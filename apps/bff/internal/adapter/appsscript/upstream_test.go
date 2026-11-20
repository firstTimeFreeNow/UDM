package appsscript

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/config"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

func configFixture() config.Config {
	return config.Config{Project: "fixture-project", SharedSecret: strings.Repeat("b", 64), UpstreamURL: "https://script.google.com/macros/s/fixture/exec", Origins: []string{"https://site.example"}}
}
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
	_, e := New(cfg, client)(context.Background(), "af.answers.save", map[string]any{}, "private-token", domain.NewID())
	var api *domain.APIError
	if !errors.As(e, &api) || !api.Unknown || calls != 1 {
		t.Fatal("write domain.Failure not ambiguous or retried", e)
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

func TestCrossLanguageHMACFixture(t *testing.T) {
	raw, e := os.ReadFile("../../../../../packages/contracts/fixtures/hmac.json")
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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
