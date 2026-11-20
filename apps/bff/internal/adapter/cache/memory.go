package cache

import "github.com/firstTimeFreeNow/UDM/apps/bff/internal/application"

type Memory struct {
	state   *application.Snapshot
	history map[int]application.HistoryEntry
}

func New() *Memory                                    { return &Memory{history: map[int]application.HistoryEntry{}} }
func (m *Memory) Schedule() *application.Snapshot     { return m.state }
func (m *Memory) SetSchedule(s *application.Snapshot) { m.state = s }
func (m *Memory) History(offset int) (application.HistoryEntry, bool) {
	v, ok := m.history[offset]
	return v, ok
}
func (m *Memory) SetHistory(offset int, v application.HistoryEntry) { m.history[offset] = v }
func (m *Memory) ClearHistory()                                     { clear(m.history) }
func (m *Memory) HistorySize() int                                  { return len(m.history) }

var _ application.Cache = (*Memory)(nil)
