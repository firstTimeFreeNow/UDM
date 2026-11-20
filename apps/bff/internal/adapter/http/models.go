package httpadapter

import "github.com/firstTimeFreeNow/UDM/apps/bff/internal/domain"

// Wire models are generated; domain models remain independent of HTTP contracts.
func scheduleResponse(s *domain.Schedule) Schedule {
	out := Schedule{
		WeekId: s.WeekID, Confirmed: s.Confirmed, MinParticipants: s.Min,
		MaxParticipants: ScheduleMaxParticipants(s.Max),
		Members:         make([]Member, len(s.Members)), Slots: make([]Slot, len(s.Slots)),
		Answers: make(map[string]map[string]Answer, len(s.Answers)),
	}
	for i, m := range s.Members {
		out.Members[i] = Member{Id: m.ID, Name: m.Name, Required: m.Required}
	}
	for i, s := range s.Slots {
		out.Slots[i] = Slot{Key: s.Key, Date: s.Date, Time: s.Time, Count: s.Count, Judgment: SlotJudgment(s.Judgment), HasAnswers: s.HasAnswers}
	}
	for id, answers := range s.Answers {
		out.Answers[id] = map[string]Answer{}
		for key, answer := range answers {
			out.Answers[id][key] = Answer(answer)
		}
	}
	return out
}
func wireData(value any) any {
	if s, ok := value.(*domain.Schedule); ok {
		return scheduleResponse(s)
	}
	return value
}
