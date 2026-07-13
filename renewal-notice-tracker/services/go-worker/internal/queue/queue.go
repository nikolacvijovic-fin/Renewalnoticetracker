package queue

import "errors"

type JobType string

const (
	ReminderDelivery     JobType = "reminder_delivery"
	ImportProcessing     JobType = "import_processing"
	WebhookDispatch       JobType = "webhook_dispatch"
	AuditEventProcessing  JobType = "audit_event_processing"
)

type Job struct {
	OrganizationID string
	JobID          string
	Type           JobType
	IdempotencyKey string
	Payload        map[string]any
}

func Validate(job Job) error {
	if job.OrganizationID == "" {
		return errors.New("organization_id_required")
	}
	if job.JobID == "" {
		return errors.New("job_id_required")
	}
	if job.IdempotencyKey == "" {
		return errors.New("idempotency_key_required")
	}
	switch job.Type {
	case ReminderDelivery, ImportProcessing, WebhookDispatch, AuditEventProcessing:
		return nil
	default:
		return errors.New("unsupported_job_type")
	}
}
