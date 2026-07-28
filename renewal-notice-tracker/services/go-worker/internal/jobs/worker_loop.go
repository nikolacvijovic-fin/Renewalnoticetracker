package jobs

import (
	"context"

	"noticecontrol/go-worker/internal/clients"
)

type WorkerLoop struct {
	Client clients.NoticeControlClient
	Limit  int
}

func (loop WorkerLoop) RunOnce(ctx context.Context) (clients.ClaimResponse, error) {
	return loop.Client.ClaimAndProcessTrustedReminders(ctx, loop.Limit)
}
