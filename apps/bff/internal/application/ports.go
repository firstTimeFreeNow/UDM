package application

import (
	"encoding/json"
	"github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"
	"time"
)

type Snapshot struct {
	State    *domain.Schedule
	At       time.Time
	Revision string
}
type HistoryEntry struct {
	Data     json.RawMessage
	At       time.Time
	Revision string
}

// Cache is accessed while the use case holds its serialization gate.
// The application owns invalidation and TTL policy; adapters own storage.
type Cache interface {
	Schedule() *Snapshot
	SetSchedule(*Snapshot)
	History(int) (HistoryEntry, bool)
	SetHistory(int, HistoryEntry)
	ClearHistory()
	HistorySize() int
}
