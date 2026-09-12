package jobs

import "time"

const maximumRetryDelay = 60 * time.Second

// RetryDelay applies exponential backoff while keeping retry latency bounded.
func RetryDelay(base time.Duration, consecutiveFailures int) time.Duration {
	if consecutiveFailures <= 0 {
		return base
	}
	delay := base
	for attempt := 1; attempt < consecutiveFailures && delay < maximumRetryDelay; attempt++ {
		delay *= 2
		if delay >= maximumRetryDelay {
			return maximumRetryDelay
		}
	}
	return delay
}
