package application

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
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
func serverFixture(t *testing.T, send Sender, now func() time.Time) *Service {
	t.Helper()
	s := New(send, &testCache{history: map[int]HistoryEntry{}}, now)
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
func call(s *Service, operation Operation) (Result, error) {
	return s.Execute(context.Background(), "member", "member", domain.NewID(), operation)
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
			p := r.Data.(*domain.Schedule)
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
	if r.Meta.Remaining != 180000 || len(r.Data.(*domain.Schedule).Members) != 0 || len(r.Data.(*domain.Schedule).Answers) != 0 {
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
	result, e := s.Execute(context.Background(), "admin", "admin", domain.NewID(), op("admin"))
	if e != nil {
		t.Fatal(e)
	}
	if result.Data.(*domain.Schedule).Slots[0].HasAnswers == nil || !*result.Data.(*domain.Schedule).Slots[0].HasAnswers {
		t.Fatal("missing deletion flags")
	}
	_, e = call(s, op("admin"))
	var api *domain.APIError
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
		return nil, &domain.APIError{Code: "UPSTREAM_UNAVAILABLE", Unknown: true}
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
	var api *domain.APIError
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
		State domain.Schedule `json:"state"`
	}
	json.Unmarshal(raw, &saved)
	if len(saved.State.Answers[memberB]) != 0 {
		t.Fatal("save leaked answers")
	}
	if _, e = call(s, op("answer")); e != nil || reads.Load() != 0 {
		t.Fatal("save cache was not reused", e)
	}
}

func TestInvalidUpstreamScheduleNeverAcknowledgesWrite(t *testing.T) {
	s := serverFixture(t, respond(func(context.Context, string, map[string]any, string, string) (json.RawMessage, error) {
		return json.RawMessage(`{"saved":true,"state":{}}`), nil
	}), nil)
	_, e := call(s, Operation{Action: "af.answers.save", Payload: map[string]any{}})
	var api *domain.APIError
	if !errors.As(e, &api) || !api.Unknown {
		t.Fatal("malformed write acknowledged")
	}
}

type testCache struct {
	state   *Snapshot
	history map[int]HistoryEntry
}

func (m *testCache) Schedule() *Snapshot                { return m.state }
func (m *testCache) SetSchedule(s *Snapshot)            { m.state = s }
func (m *testCache) History(k int) (HistoryEntry, bool) { v, ok := m.history[k]; return v, ok }
func (m *testCache) SetHistory(k int, v HistoryEntry)   { m.history[k] = v }
func (m *testCache) ClearHistory()                      { clear(m.history) }
func (m *testCache) HistorySize() int                   { return len(m.history) }
