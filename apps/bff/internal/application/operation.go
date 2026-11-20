package application

type Operation struct {
	Action  string
	Payload map[string]any
	Fresh   bool
}

func Public(action string) bool {
	switch action {
	case "af.push.status", "af.push.subscribe", "af.push.unsubscribe", "udm.links.resolve":
		return true
	}
	return false
}
func ReadOnly(action string) bool {
	switch action {
	case "af.session", "af.read", "af.history", "af.push.status", "udm.links.resolve", "udm.links.list":
		return true
	}
	return false
}
func Participant(action string) bool {
	switch action {
	case "af.session", "af.read", "af.answers.save", "af.history", "udm.links.share":
		return true
	}
	return false
}
func Mutation(action string) bool {
	switch action {
	case "af.answers.save", "af.members.add", "af.members.required", "af.candidates.add", "af.candidates.remove", "af.confirm":
		return true
	}
	return false
}
func StringValue(v any) string { s, _ := v.(string); return s }
