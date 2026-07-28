package jobs

func ShouldRetryTransientFailure(statusCode int, attempts int, maxAttempts int) bool {
	return ClassifyRetry(statusCode, attempts, maxAttempts).Retryable
}
