package appsscript

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/application"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/config"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
	"io"
	"net/http"
	"strings"
	"time"
)

// encoding/json sorts map keys. Disable HTML escaping to match Apps Script JSON.stringify.
func canonical(value any) ([]byte, error) {
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	if err := e.Encode(value); err != nil {
		return nil, err
	}
	out := bytes.TrimSuffix(b.Bytes(), []byte("\n"))
	// Consume escape pairs so a literal backslash-u sequence is never rewritten.
	var fixed bytes.Buffer
	for i := 0; i < len(out); {
		if out[i] == '\\' && i+1 < len(out) {
			if i+6 <= len(out) && (string(out[i:i+6]) == `\u2028` || string(out[i:i+6]) == `\u2029`) {
				if out[i+5] == '8' {
					fixed.WriteRune('\u2028')
				} else {
					fixed.WriteRune('\u2029')
				}
				i += 6
				continue
			}
			fixed.Write(out[i : i+2])
			i += 2
			continue
		}
		fixed.WriteByte(out[i])
		i++
	}
	out = fixed.Bytes()
	return out, nil
}
func signRequest(input map[string]any, secret string) (string, error) {
	raw, e := canonical(input)
	if e != nil {
		return "", e
	}
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(raw)
	return hex.EncodeToString(m.Sum(nil)), nil
}

func New(cfg config.Config, client *http.Client) application.Sender {
	return func(ctx context.Context, action string, payload map[string]any, token, id string) (json.RawMessage, error) {
		ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
		defer cancel()
		issued := time.Now().UnixMilli()
		nonce := domain.NewID()
		input := map[string]any{"version": 1, "requestId": id, "action": action, "payload": payload, "idToken": token, "issuedAt": issued, "nonce": nonce}
		signature, e := signRequest(input, cfg.SharedSecret)
		if e != nil {
			return nil, domain.Failure("INVALID_REQUEST")
		}
		delete(input, "issuedAt")
		delete(input, "nonce")
		input["bff"] = map[string]any{"issuedAt": issued, "nonce": nonce, "signature": signature}
		raw, e := canonical(input)
		if e != nil {
			return nil, domain.Failure("INVALID_REQUEST")
		}
		request, e := http.NewRequestWithContext(ctx, http.MethodPost, cfg.UpstreamURL, bytes.NewReader(raw))
		if e != nil {
			return nil, domain.Failure("CONFIG_REQUIRED")
		}
		request.Header.Set("Content-Type", "application/json")
		unknown := !application.ReadOnly(action)
		response, e := client.Do(request)
		if e != nil {
			return nil, &domain.APIError{Code: "UPSTREAM_UNAVAILABLE", Unknown: unknown, Upstream: true}
		}
		defer response.Body.Close()
		data, e := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
		if e != nil || len(data) > 4*1024*1024 {
			return nil, &domain.APIError{Code: "INVALID_RESPONSE", Unknown: unknown, Upstream: true}
		}
		var result struct {
			Version   int             `json:"version"`
			RequestID string          `json:"requestId"`
			OK        *bool           `json:"ok"`
			Data      json.RawMessage `json:"data"`
			Error     struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if response.StatusCode != 200 || !strings.HasPrefix(strings.ToLower(response.Header.Get("Content-Type")), "application/json") || json.Unmarshal(data, &result) != nil || result.Version != 1 || result.RequestID != id || result.OK == nil {
			return nil, &domain.APIError{Code: "INVALID_RESPONSE", Unknown: unknown, Upstream: true}
		}
		if !*result.OK {
			code := result.Error.Code
			switch code {
			case "INVALID_REQUEST", "AUTH_REQUIRED", "FORBIDDEN", "CONFIG_REQUIRED", "BUSY", "CONFLICT", "WEEK_CHANGED", "CAPACITY", "HAS_ANSWERS", "INELIGIBLE", "DUPLICATE", "NOT_FOUND", "INTERNAL_ERROR":
			default:
				code = "INVALID_RESPONSE"
			}
			return nil, &domain.APIError{Code: code, Upstream: true, Unknown: unknown && (code == "INTERNAL_ERROR" || code == "INVALID_RESPONSE")}
		}
		if len(result.Data) == 0 || bytes.Equal(result.Data, []byte("null")) {
			return nil, &domain.APIError{Code: "INVALID_RESPONSE", Unknown: unknown, Upstream: true}
		}
		return result.Data, nil
	}
}
