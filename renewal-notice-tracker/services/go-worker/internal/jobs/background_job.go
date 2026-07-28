package jobs

import "noticecontrol/go-worker/internal/queue"

type BackgroundJob = queue.Job

const TrustedReminderDeliveryJobType = queue.TrustedReminderDelivery
