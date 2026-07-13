package jobs

import "noticecontrol/go-worker/internal/queue"

func ValidateAuditEventProcessing(job queue.Job) error {
	return queue.Validate(job)
}
