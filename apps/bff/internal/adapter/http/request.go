package httpadapter

import "encoding/json"

// Decode with generated models to keep JSON field types tied to the shared contract.
// The original map is forwarded so Apps Script retains its existing validation,
// conflict checks and handling of unknown fields.
func validateRequestTypes(action string, body map[string]any) error {
	var model any
	switch action {
	case "af.answers.save":
		model = &SaveAnswersRequest{}
	case "af.members.add":
		model = &AddMemberRequest{}
	case "af.members.required":
		model = &RequiredMemberRequest{}
	case "af.candidates.add":
		model = &AddCandidateRequest{}
	case "af.candidates.remove":
		model = &RemoveCandidateRequest{}
	case "af.confirm":
		model = &ConfirmRequest{}
	case "af.push.status", "af.push.subscribe", "af.push.unsubscribe":
		model = &PushTokenRequest{}
	case "af.push.test":
		model = &PushTestRequest{}
	case "udm.links.resolve":
		model = &ResolveLinkRequest{}
	case "udm.links.share":
		model = &ShareLinkRequest{}
	case "udm.links.create":
		model = &CreateLinkRequest{}
	case "udm.links.update":
		model = &UpdateLinkRequest{}
	default:
		return nil
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, model)
}
