package jobs

import "noticecontrol/go-worker/internal/queue"

func ValidateWebhookDispatch(job queue.Job) error {
	return queue.Validate(job)
}
