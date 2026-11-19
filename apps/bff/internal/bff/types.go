package bff

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const TTL = 5 * time.Minute

type APIError struct {
	Code    string
	Status  int
	Unknown bool
}

func (e *APIError) Error() string               { return e.Code }
func failure(code string, status int) *APIError { return &APIError{Code: code, Status: status} }
func uuid() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic("random source unavailable")
	}
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

type Config struct {
	Project, SharedSecret, UpstreamURL string
	Origins                            []string
}

var execPath = regexp.MustCompile(`^/macros/s/[A-Za-z0-9_-]+/exec$`)
var secretPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (c Config) Validate() error {
	u, e := url.Parse(c.UpstreamURL)
	if e != nil || u.Scheme != "https" || u.Host != "script.google.com" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || !execPath.MatchString(u.Path) || u.RawPath != "" {
		return failure("CONFIG_REQUIRED", 503)
	}
	if c.Project == "" || !secretPattern.MatchString(c.SharedSecret) || len(c.Origins) == 0 {
		return failure("CONFIG_REQUIRED", 503)
	}
	for _, s := range c.Origins {
		u, e := url.Parse(s)
		if e != nil || u.User != nil || u.Host == "" || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) {
			return failure("CONFIG_REQUIRED", 503)
		}
	}
	return nil
}

type Operation struct {
	Action  string
	Payload map[string]any
	Fresh   bool
}

func public(action string) bool {
	switch action {
	case "af.push.status", "af.push.subscribe", "af.push.unsubscribe", "udm.links.resolve":
		return true
	}
	return false
}
func readOnly(action string) bool {
	switch action {
	case "af.session", "af.read", "af.history", "af.push.status", "udm.links.resolve", "udm.links.list":
		return true
	}
	return false
}
func participant(action string) bool {
	switch action {
	case "af.session", "af.read", "af.answers.save", "af.history", "udm.links.share":
		return true
	}
	return false
}
func mutation(action string) bool {
	switch action {
	case "af.answers.save", "af.members.add", "af.members.required", "af.candidates.add", "af.candidates.remove", "af.confirm":
		return true
	}
	return false
}
func stringValue(v any) string { s, _ := v.(string); return s }
func route(method string, u *url.URL, body map[string]any) (Operation, error) {
	p := strings.TrimSuffix(u.Path, "/")
	op := Operation{Payload: body}
	if op.Payload == nil {
		op.Payload = map[string]any{}
	}
	if method == http.MethodGet {
		switch p {
		case "/v1/session":
			op.Action = "af.session"
		case "/v1/afetiria-extra/overview", "/v1/afetiria-extra/answers", "/v1/afetiria-extra/admin":
			view := map[string]string{"/v1/afetiria-extra/overview": "schedule", "/v1/afetiria-extra/answers": "answer", "/v1/afetiria-extra/admin": "admin"}[p]
			op.Action = "af.read"
			op.Payload = map[string]any{"view": view, "memberId": u.Query().Get("memberId")}
			op.Fresh = u.Query().Get("fresh") == "1"
		case "/v1/afetiria-extra/history":
			offset := 0
			var e error
			if v := u.Query().Get("offset"); v != "" {
				offset, e = strconv.Atoi(v)
			}
			if e != nil || offset < 0 || offset > 10000 {
				return op, failure("INVALID_REQUEST", 400)
			}
			op.Action = "af.history"
			op.Payload = map[string]any{"offset": offset}
		case "/v1/links":
			op.Action = "udm.links.list"
		}
	} else {
		op.Action = map[string]string{
			"POST /v1/afetiria-extra/answers": "af.answers.save", "POST /v1/afetiria-extra/members": "af.members.add", "PATCH /v1/afetiria-extra/members/required": "af.members.required",
			"POST /v1/afetiria-extra/candidates": "af.candidates.add", "DELETE /v1/afetiria-extra/candidates": "af.candidates.remove", "POST /v1/afetiria-extra/confirmation": "af.confirm",
			"POST /v1/afetiria-extra/push/status": "af.push.status", "POST /v1/afetiria-extra/push/subscription": "af.push.subscribe", "DELETE /v1/afetiria-extra/push/subscription": "af.push.unsubscribe", "POST /v1/afetiria-extra/push/test": "af.push.test",
			"POST /v1/links/resolve": "udm.links.resolve", "POST /v1/links/share": "udm.links.share", "POST /v1/links": "udm.links.create", "PATCH /v1/links": "udm.links.update",
		}[method+" "+p]
	}
	if op.Action == "" {
		return op, failure("NOT_FOUND", 404)
	}
	return op, nil
}

type Member struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Required bool   `json:"required"`
}
type Slot struct {
	Key        string `json:"key"`
	Date       string `json:"date"`
	Time       string `json:"time"`
	Count      int    `json:"count"`
	Judgment   string `json:"judgment"`
	HasAnswers *bool  `json:"hasAnswers,omitempty"`
}
type Schedule struct {
	WeekID    string                       `json:"weekId"`
	Confirmed *string                      `json:"confirmed"`
	Min       int                          `json:"minParticipants"`
	Max       int                          `json:"maxParticipants"`
	Members   []Member                     `json:"members"`
	Slots     []Slot                       `json:"slots"`
	Answers   map[string]map[string]string `json:"answers"`
}

var memberPattern = regexp.MustCompile(`^m_[a-f0-9-]{36}$`)

func validDay(s string) bool { _, e := time.Parse("2006-01-02", s); return e == nil }
func validSlot(s string) bool {
	t, e := time.Parse("2006-01-02 15:04", s)
	return e == nil && (t.Minute() == 0 || t.Minute() == 30)
}
func parseSchedule(raw json.RawMessage) (*Schedule, error) {
	var s Schedule
	if json.Unmarshal(raw, &s) != nil || !validDay(s.WeekID) || s.Members == nil || s.Slots == nil || s.Answers == nil || len(s.Members) > 12 || len(s.Slots) > 54 || s.Min < 1 || s.Min > 8 || s.Max != 8 || (s.Confirmed != nil && !validSlot(*s.Confirmed)) {
		return nil, failure("INVALID_RESPONSE", 502)
	}

	var shape struct {
		Confirmed json.RawMessage              `json:"confirmed"`
		Members   []map[string]json.RawMessage `json:"members"`
		Slots     []map[string]json.RawMessage `json:"slots"`
	}
	if json.Unmarshal(raw, &shape) != nil || len(shape.Confirmed) == 0 {
		return nil, failure("INVALID_RESPONSE", 502)
	}
	present := func(fields map[string]json.RawMessage, key string) bool {
		value := fields[key]
		return len(value) > 0 && !bytes.Equal(value, []byte("null"))
	}
	for _, m := range shape.Members {
		if !present(m, "name") || !present(m, "required") {
			return nil, failure("INVALID_RESPONSE", 502)
		}
	}
	for _, slot := range shape.Slots {
		if !present(slot, "count") {
			return nil, failure("INVALID_RESPONSE", 502)
		}
	}
	keys := map[string]bool{}
	for _, slot := range s.Slots {
		if slot.Key != slot.Date+" "+slot.Time || !validSlot(slot.Key) || keys[slot.Key] || slot.Count < 0 {
			return nil, failure("INVALID_RESPONSE", 502)
		}
		switch slot.Judgment {
		case "開催可能", "必須未達", "人数不足", "人数調整":
		default:
			return nil, failure("INVALID_RESPONSE", 502)
		}
		keys[slot.Key] = true
	}
	ids := map[string]bool{}
	for _, m := range s.Members {
		if !memberPattern.MatchString(m.ID) || ids[m.ID] || s.Answers[m.ID] == nil {
			return nil, failure("INVALID_RESPONSE", 502)
		}
		ids[m.ID] = true
		for key, a := range s.Answers[m.ID] {
			if !keys[key] || (a != "○" && a != "△" && a != "×" && a != "") {
				return nil, failure("INVALID_RESPONSE", 502)
			}
		}
	}
	return &s, nil
}
func project(s *Schedule, view, memberID string) (*Schedule, error) {
	out := *s
	out.Members = append([]Member{}, s.Members...)
	out.Slots = append([]Slot{}, s.Slots...)
	out.Answers = map[string]map[string]string{}
	if view == "schedule" {
		out.Members = []Member{}
	} else {
		found := memberID == ""
		for _, m := range s.Members {
			out.Answers[m.ID] = map[string]string{}
			if m.ID == memberID {
				found = true
				if view == "answer" {
					for k, v := range s.Answers[m.ID] {
						out.Answers[m.ID][k] = v
					}
				}
			}
		}
		if view == "answer" && !found {
			return nil, failure("INVALID_REQUEST", 400)
		}
	}
	for i := range out.Slots {
		out.Slots[i].HasAnswers = nil
		if view == "admin" {
			has := false
			for _, entries := range s.Answers {
				if entries[out.Slots[i].Key] != "" {
					has = true
				}
			}
			out.Slots[i].HasAnswers = &has
		}
	}
	return &out, nil
}
