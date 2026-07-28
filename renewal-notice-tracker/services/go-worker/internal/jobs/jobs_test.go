package jobs

import (
	"testing"

	"noticecontrol/go-worker/internal/queue"
)

func TestRetryClassification(t *testing.T) {
	decision := ClassifyRetry(500, 1, 3)
	if !decision.Retryable || decision.Category != "retry_scheduled" {
		t.Fatalf("unexpected retry decision: %+v", decision)
	}
}

func TestReminderJobPayloadValidation(t *testing.T) {
	err := ValidateReminderDelivery(queue.Job{
		OrganizationID: "org-1",
		JobID:          "job-1",
		Type:           queue.TrustedReminderDelivery,
		IdempotencyKey: "reminder-1",
		Payload: map[string]any{
			"reminder_id": "reminder-1",
			"contract_id": "contract-1",
		},
	})
	if err != nil {
		t.Fatalf("expected valid reminder payload: %v", err)
	}
}

func TestImportJobPayloadValidation(t *testing.T) {
	err := ValidateImportProcessing(queue.Job{
		OrganizationID: "org-1",
		JobID:          "job-1",
		Type:           queue.ContractImportProcessing,
		IdempotencyKey: "import-1",
		Payload: map[string]any{
			"batch_id": "batch-1",
		},
	})
	if err != nil {
		t.Fatalf("expected valid import payload: %v", err)
	}
}
