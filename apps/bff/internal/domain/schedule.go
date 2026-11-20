package domain

import (
	"bytes"
	"encoding/json"
	"regexp"
	"time"
)

type APIError struct {
	Code     string
	Unknown  bool
	Limited  bool
	Upstream bool
}

func (e *APIError) Error() string   { return e.Code }
func Failure(code string) *APIError { return &APIError{Code: code} }

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

func ValidDay(s string) bool { _, e := time.Parse("2006-01-02", s); return e == nil }
func ValidSlot(s string) bool {
	t, e := time.Parse("2006-01-02 15:04", s)
	return e == nil && (t.Minute() == 0 || t.Minute() == 30)
}
func ParseSchedule(raw json.RawMessage) (*Schedule, error) {
	var s Schedule
	if json.Unmarshal(raw, &s) != nil || !ValidDay(s.WeekID) || s.Members == nil || s.Slots == nil || s.Answers == nil || len(s.Members) > 12 || len(s.Slots) > 54 || s.Min < 1 || s.Min > 8 || s.Max != 8 || (s.Confirmed != nil && !ValidSlot(*s.Confirmed)) {
		return nil, Failure("INVALID_RESPONSE")
	}

	var shape struct {
		Confirmed json.RawMessage              `json:"confirmed"`
		Members   []map[string]json.RawMessage `json:"members"`
		Slots     []map[string]json.RawMessage `json:"slots"`
	}
	if json.Unmarshal(raw, &shape) != nil || len(shape.Confirmed) == 0 {
		return nil, Failure("INVALID_RESPONSE")
	}
	present := func(fields map[string]json.RawMessage, key string) bool {
		value := fields[key]
		return len(value) > 0 && !bytes.Equal(value, []byte("null"))
	}
	for _, m := range shape.Members {
		if !present(m, "name") || !present(m, "required") {
			return nil, Failure("INVALID_RESPONSE")
		}
	}
	for _, slot := range shape.Slots {
		if !present(slot, "count") {
			return nil, Failure("INVALID_RESPONSE")
		}
	}
	keys := map[string]bool{}
	for _, slot := range s.Slots {
		if slot.Key != slot.Date+" "+slot.Time || !ValidSlot(slot.Key) || keys[slot.Key] || slot.Count < 0 {
			return nil, Failure("INVALID_RESPONSE")
		}
		switch slot.Judgment {
		case "開催可能", "必須未達", "人数不足", "人数調整":
		default:
			return nil, Failure("INVALID_RESPONSE")
		}
		keys[slot.Key] = true
	}
	ids := map[string]bool{}
	for _, m := range s.Members {
		if !memberPattern.MatchString(m.ID) || ids[m.ID] || s.Answers[m.ID] == nil {
			return nil, Failure("INVALID_RESPONSE")
		}
		ids[m.ID] = true
		for key, a := range s.Answers[m.ID] {
			if !keys[key] || (a != "○" && a != "△" && a != "×" && a != "") {
				return nil, Failure("INVALID_RESPONSE")
			}
		}
	}
	return &s, nil
}
func Project(s *Schedule, view, memberID string) (*Schedule, error) {
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
			return nil, Failure("INVALID_REQUEST")
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
