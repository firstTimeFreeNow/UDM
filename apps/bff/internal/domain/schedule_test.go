package domain

import (
	"encoding/json"
	"strings"
	"testing"
)

const memberA = "m_00000000-0000-0000-0000-000000000001"
const memberB = "m_00000000-0000-0000-0000-000000000002"
const slot = "2026-11-16 21:30"

func stateFixture() json.RawMessage {
	return json.RawMessage(`{"weekId":"2026-11-16","confirmed":null,"minParticipants":6,"maxParticipants":8,"members":[{"id":"` + memberA + `","name":"A","required":true},{"id":"` + memberB + `","name":"B","required":false}],"slots":[{"key":"` + slot + `","date":"2026-11-16","time":"21:30","count":1,"judgment":"人数不足"}],"answers":{"` + memberA + `":{"` + slot + `":"○"},"` + memberB + `":{"` + slot + `":"×"}}}`)
}
func TestMissingRequiredUpstreamFieldsAreRejected(t *testing.T) {
	for _, changed := range []string{strings.Replace(string(stateFixture()), `"confirmed":null,`, "", 1), strings.Replace(string(stateFixture()), `"required":true`, `"required":null`, 1), strings.Replace(string(stateFixture()), `"count":1`, `"count":null`, 1), strings.Replace(string(stateFixture()), `"name":"A"`, `"name":null`, 1)} {
		if _, e := ParseSchedule(json.RawMessage(changed)); e == nil {
			t.Fatal("missing or null field accepted")
		}
	}
}
