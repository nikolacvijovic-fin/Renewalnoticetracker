package jobs

import (
	"errors"

	"noticecontrol/go-worker/internal/queue"
)

func ValidateReminderDelivery(job queue.Job) error {
	if err := queue.Validate(job); err != nil {
		return err
	}
	if job.Type != queue.ReminderDelivery {
		return errors.New("invalid_reminder_job_type")
	}
	if job.Payload["reminder_id"] == "" || job.Payload["contract_id"] == "" {
		return errors.New("reminder_payload_incomplete")
	}
	return nil
}
