package firebase

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const certificateURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

type tokenVerifier struct {
	mu      sync.Mutex
	project string
	client  *http.Client
	keys    map[string]*rsa.PublicKey
	until   time.Time
	now     func() time.Time
}

func (v *tokenVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.until.After(v.now()) {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		request, _ := http.NewRequestWithContext(ctx, http.MethodGet, certificateURL, nil)
		response, e := v.client.Do(request)
		if e != nil {
			return nil, e
		}
		defer response.Body.Close()
		raw, e := io.ReadAll(io.LimitReader(response.Body, 256*1024+1))
		if e != nil || len(raw) > 256*1024 || response.StatusCode != 200 {
			return nil, domain.Failure("AUTH_REQUIRED")
		}
		var certs map[string]string
		if json.Unmarshal(raw, &certs) != nil || len(certs) == 0 {
			return nil, domain.Failure("AUTH_REQUIRED")
		}
		keys := map[string]*rsa.PublicKey{}
		for id, text := range certs {
			block, _ := pem.Decode([]byte(text))
			if block == nil {
				continue
			}
			cert, e := x509.ParseCertificate(block.Bytes)
			if e != nil {
				continue
			}
			key, ok := cert.PublicKey.(*rsa.PublicKey)
			if ok && key.N.BitLen() >= 2048 {
				keys[id] = key
			}
		}
		seconds := 300
		for _, part := range strings.Split(response.Header.Get("Cache-Control"), ",") {
			if value, ok := strings.CutPrefix(strings.TrimSpace(part), "max-age="); ok {
				if n, e := strconv.Atoi(value); e == nil && n >= 0 {
					seconds = min(n, 86400)
				}
			}
		}
		v.keys = keys
		v.until = v.now().Add(time.Duration(seconds) * time.Second)
	}
	key := v.keys[kid]
	if key == nil {
		return nil, domain.Failure("AUTH_REQUIRED")
	}
	return key, nil
}

// Follows Firebase's RS256 ID-token verification requirements; no client claim grants a role.
func (v *tokenVerifier) Verify(ctx context.Context, token string) (string, error) {
	deny := domain.Failure("AUTH_REQUIRED")
	if len(token) == 0 || len(token) > 16000 {
		return "", deny
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", deny
	}
	headerBytes, e := base64.RawURLEncoding.DecodeString(parts[0])
	if e != nil {
		return "", deny
	}
	var h struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if json.Unmarshal(headerBytes, &h) != nil || h.Alg != "RS256" || h.Kid == "" || len(h.Kid) > 256 {
		return "", deny
	}
	raw, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil {
		return "", deny
	}
	var claims struct {
		Audience string `json:"aud"`
		Issuer   string `json:"iss"`
		Subject  string `json:"sub"`
		Expires  *int64 `json:"exp"`
		Issued   *int64 `json:"iat"`
		AuthTime *int64 `json:"auth_time"`
	}
	if json.Unmarshal(raw, &claims) != nil || claims.Audience != v.project || claims.Issuer != "https://securetoken.google.com/"+v.project || claims.Subject == "" || len(claims.Subject) > 128 || claims.Expires == nil || claims.Issued == nil || claims.AuthTime == nil {
		return "", deny
	}
	now := v.now().Unix()
	if *claims.Expires <= now-5 || *claims.Issued > now+5 || *claims.Issued <= 0 || *claims.AuthTime > now+5 || *claims.AuthTime <= 0 || *claims.Expires <= *claims.Issued {
		return "", deny
	}
	key, e := v.key(ctx, h.Kid)
	if e != nil {
		return "", deny
	}
	signature, e := base64.RawURLEncoding.DecodeString(parts[2])
	if e != nil {
		return "", deny
	}
	hash := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, hash[:], signature) != nil {
		return "", deny
	}
	return claims.Subject, nil
}

func New(project string, client *http.Client, now func() time.Time) *tokenVerifier {
	return &tokenVerifier{project: project, client: client, now: now}
}
