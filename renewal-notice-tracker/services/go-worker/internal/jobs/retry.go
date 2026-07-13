package jobs

type RetryDecision struct {
	Retryable bool
	Category  string
}

func ClassifyRetry(statusCode int, attempts int, maxAttempts int) RetryDecision {
	if attempts >= maxAttempts {
		return RetryDecision{Retryable: false, Category: "retry_exhausted"}
	}
	if statusCode == 408 || statusCode == 429 || statusCode >= 500 {
		return RetryDecision{Retryable: true, Category: "retry_scheduled"}
	}
	if statusCode >= 400 {
		return RetryDecision{Retryable: false, Category: "validation_failed"}
	}
	return RetryDecision{Retryable: false, Category: "completed"}
}
