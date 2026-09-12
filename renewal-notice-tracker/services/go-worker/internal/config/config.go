package config

import (
	"errors"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Environment            string
	NoticeControlURL       string
	SigningSecret          string
	WorkerID               string
	ClaimLimit             int
	PollInterval           time.Duration
	MaxConsecutiveFailures int
	configurationError     error
}

func boundedInteger(name string, fallback int, minimum int, maximum int) (int, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return fallback, errors.New(name + "_invalid")
	}
	return value, nil
}

func Load() Config {
	env := os.Getenv("NOTICECONTROL_WORKER_ENV")
	if env == "" {
		env = "development"
	}
	limit, limitError := boundedInteger("NOTICECONTROL_WORKER_CLAIM_LIMIT", 5, 1, 50)
	pollIntervalMilliseconds, pollError := boundedInteger("NOTICECONTROL_WORKER_POLL_INTERVAL_MS", 5000, 500, 60000)
	maxConsecutiveFailures, failuresError := boundedInteger("NOTICECONTROL_WORKER_MAX_CONSECUTIVE_FAILURES", 5, 1, 100)
	configurationError := errors.Join(limitError, pollError, failuresError)
	workerID := os.Getenv("NOTICECONTROL_WORKER_ID")
	if workerID == "" {
		workerID = "go-worker-local"
	}
	return Config{
		Environment:            env,
		NoticeControlURL:       os.Getenv("NOTICECONTROL_APP_URL"),
		SigningSecret:          os.Getenv("ADD_ON_INTERNAL_SIGNING_SECRET"),
		WorkerID:               workerID,
		ClaimLimit:             limit,
		PollInterval:           time.Duration(pollIntervalMilliseconds) * time.Millisecond,
		MaxConsecutiveFailures: maxConsecutiveFailures,
		configurationError:     configurationError,
	}
}

func (config Config) ValidateRuntime() error {
	if config.configurationError != nil {
		return config.configurationError
	}
	if config.NoticeControlURL == "" {
		return errors.New("noticecontrol_app_url_required")
	}
	if config.SigningSecret == "" {
		return errors.New("signing_secret_required")
	}
	if config.WorkerID == "" {
		return errors.New("worker_id_required")
	}
	if config.ClaimLimit < 1 {
		return errors.New("claim_limit_invalid")
	}
	if config.PollInterval < 500*time.Millisecond || config.PollInterval > 60*time.Second {
		return errors.New("poll_interval_invalid")
	}
	if config.MaxConsecutiveFailures < 1 {
		return errors.New("max_consecutive_failures_invalid")
	}
	return nil
}
