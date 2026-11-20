package domain

import (
	"encoding/json"
	"os"
	"testing"
)

func TestSharedScheduleContractFixtures(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/contracts/fixtures/schedules.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name  string          `json:"name"`
		Valid bool            `json:"valid"`
		Value json.RawMessage `json:"value"`
	}
	if err = json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			_, err := ParseSchedule(c.Value)
			if (err == nil) != c.Valid {
				t.Fatalf("valid=%v, error=%v", c.Valid, err)
			}
		})
	}
}
