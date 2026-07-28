package jobs

import "noticecontrol/go-worker/internal/queue"

func ValidateTrustedReminderDelivery(job queue.Job) error {
	return ValidateReminderDelivery(job)
}
