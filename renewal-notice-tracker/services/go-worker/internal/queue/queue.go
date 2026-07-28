package queue

import "errors"

type JobType string

const (
	TrustedReminderDelivery JobType = "trusted_reminder_delivery"
	ContractImportProcessing JobType = "contract_import_processing"
	WebhookDispatch          JobType = "webhook_dispatch"
	AuditEventFlush          JobType = "audit_event_flush"
	AddOnTask                JobType = "add_on_task"
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
	case TrustedReminderDelivery, ContractImportProcessing, WebhookDispatch, AuditEventFlush, AddOnTask:
		return nil
	default:
		return errors.New("unsupported_job_type")
	}
}
