package firebase

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"net/http"
	"testing"
	"time"
)

func TestFirebaseRS256Claims(t *testing.T) {
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	now := time.Now()
	v := &tokenVerifier{project: "fixture-project", keys: map[string]*rsa.PublicKey{"fixture": &key.PublicKey}, until: now.Add(time.Hour), now: func() time.Time { return now }}
	base := map[string]any{"aud": "fixture-project", "iss": "https://securetoken.google.com/fixture-project", "sub": "member", "exp": now.Add(time.Hour).Unix(), "iat": now.Unix(), "auth_time": now.Unix()}
	sign := func(claims map[string]any, alg string) string {
		h, _ := json.Marshal(map[string]string{"alg": alg, "kid": "fixture"})
		p, _ := json.Marshal(claims)
		body := base64.RawURLEncoding.EncodeToString(h) + "." + base64.RawURLEncoding.EncodeToString(p)
		hash := sha256.Sum256([]byte(body))
		sig, _ := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
		return body + "." + base64.RawURLEncoding.EncodeToString(sig)
	}
	token := sign(base, "RS256")
	if uid, e := v.Verify(context.Background(), token); e != nil || uid != "member" {
		t.Fatal("valid token rejected", e)
	}
	for _, change := range []map[string]any{{"aud": "other"}, {"iss": "other"}, {"sub": ""}, {"exp": now.Add(-time.Minute).Unix()}, {"iat": now.Add(time.Minute).Unix()}, {"auth_time": now.Add(time.Minute).Unix()}, {"auth_time": nil}} {
		claims := map[string]any{}
		for k, x := range base {
			claims[k] = x
		}
		for k, x := range change {
			claims[k] = x
		}
		if _, e := v.Verify(context.Background(), sign(claims, "RS256")); e == nil {
			t.Fatal("invalid claims accepted", change)
		}
	}
	if _, e := v.Verify(context.Background(), sign(base, "HS256")); e == nil {
		t.Fatal("algorithm confusion")
	}
	if _, e := v.Verify(context.Background(), token+"x"); e == nil {
		t.Fatal("invalid signature accepted")
	}
}

func TestGoogleCertificateCacheUsesPublishedExpiry(t *testing.T) {
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	now := time.Now()
	template := &x509.Certificate{SerialNumber: big.NewInt(1), NotBefore: now.Add(-time.Hour), NotAfter: now.Add(time.Hour)}
	der, e := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if e != nil {
		t.Fatal(e)
	}
	body, _ := json.Marshal(map[string]string{"current": string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))})
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != certificateURL {
			t.Fatal("certificate source changed")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Cache-Control": []string{"public, max-age=60"}}, Body: io.NopCloser(bytes.NewReader(body))}, nil
	})}
	v := &tokenVerifier{project: "fixture-project", client: client, now: func() time.Time { return now }}
	for range 2 {
		if _, e = v.key(context.Background(), "current"); e != nil {
			t.Fatal(e)
		}
	}
	if calls != 1 {
		t.Fatal("certificates were fetched repeatedly")
	}
	if _, e = v.key(context.Background(), "untrusted"); e == nil {
		t.Fatal("unknown key accepted")
	}
	now = now.Add(time.Minute)
	if _, e = v.key(context.Background(), "current"); e != nil || calls != 2 {
		t.Fatal("expired certificate cache was retained", e)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
