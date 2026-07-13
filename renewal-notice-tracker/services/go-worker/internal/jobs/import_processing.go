package jobs

import (
	"errors"

	"noticecontrol/go-worker/internal/queue"
)

func ValidateImportProcessing(job queue.Job) error {
	if err := queue.Validate(job); err != nil {
		return err
	}
	if job.Type != queue.ImportProcessing {
		return errors.New("invalid_import_job_type")
	}
	if job.Payload["batch_id"] == "" {
		return errors.New("import_payload_incomplete")
	}
	return nil
}
