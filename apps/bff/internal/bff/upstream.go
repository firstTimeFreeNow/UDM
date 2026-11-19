package bff

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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

type Sender func(context.Context, string, map[string]any, string, string) (json.RawMessage, error)

func newUpstream(cfg Config, client *http.Client) Sender {
	return func(ctx context.Context, action string, payload map[string]any, token, id string) (json.RawMessage, error) {
		ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
		defer cancel()
		issued := time.Now().UnixMilli()
		nonce := uuid()
		input := map[string]any{"version": 1, "requestId": id, "action": action, "payload": payload, "idToken": token, "issuedAt": issued, "nonce": nonce}
		signature, e := signRequest(input, cfg.SharedSecret)
		if e != nil {
			return nil, failure("INVALID_REQUEST", 400)
		}
		delete(input, "issuedAt")
		delete(input, "nonce")
		input["bff"] = map[string]any{"issuedAt": issued, "nonce": nonce, "signature": signature}
		raw, e := canonical(input)
		if e != nil {
			return nil, failure("INVALID_REQUEST", 400)
		}
		request, e := http.NewRequestWithContext(ctx, http.MethodPost, cfg.UpstreamURL, bytes.NewReader(raw))
		if e != nil {
			return nil, failure("CONFIG_REQUIRED", 503)
		}
		request.Header.Set("Content-Type", "application/json")
		unknown := !readOnly(action)
		response, e := client.Do(request)
		if e != nil {
			return nil, &APIError{"UPSTREAM_UNAVAILABLE", 502, unknown}
		}
		defer response.Body.Close()
		data, e := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
		if e != nil || len(data) > 4*1024*1024 {
			return nil, &APIError{"INVALID_RESPONSE", 502, unknown}
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
			return nil, &APIError{"INVALID_RESPONSE", 502, unknown}
		}
		if !*result.OK {
			code := result.Error.Code
			switch code {
			case "INVALID_REQUEST", "AUTH_REQUIRED", "FORBIDDEN", "CONFIG_REQUIRED", "BUSY", "CONFLICT", "WEEK_CHANGED", "CAPACITY", "HAS_ANSWERS", "INELIGIBLE", "DUPLICATE", "NOT_FOUND", "INTERNAL_ERROR":
			default:
				code = "INVALID_RESPONSE"
			}
			status := 400
			switch code {
			case "AUTH_REQUIRED":
				status = 401
			case "FORBIDDEN":
				status = 403
			case "BUSY", "CONFIG_REQUIRED":
				status = 503
			case "INVALID_RESPONSE", "INTERNAL_ERROR":
				status = 502
			}
			return nil, &APIError{code, status, unknown && (code == "INTERNAL_ERROR" || code == "INVALID_RESPONSE")}
		}
		if len(result.Data) == 0 || bytes.Equal(result.Data, []byte("null")) {
			return nil, &APIError{"INVALID_RESPONSE", 502, unknown}
		}
		return result.Data, nil
	}
}
