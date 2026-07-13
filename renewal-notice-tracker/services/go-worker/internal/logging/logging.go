package logging

type Event struct {
	Operation      string
	OrganizationID string
	JobID          string
	Status         string
	SafeMetadata   map[string]any
}

func Sanitize(event Event) Event {
	delete(event.SafeMetadata, "raw_contract_text")
	delete(event.SafeMetadata, "ocr_output")
	delete(event.SafeMetadata, "secret")
	delete(event.SafeMetadata, "token")
	return event
}
