package config

import (
	"errors"
	"os"
	"strconv"
)

type Config struct {
	Environment   string
	NoticeControlURL string
	SigningSecret string
	WorkerID      string
	ClaimLimit    int
}

func Load() Config {
	env := os.Getenv("NOTICECONTROL_WORKER_ENV")
	if env == "" {
		env = "development"
	}
	limit, err := strconv.Atoi(os.Getenv("NOTICECONTROL_WORKER_CLAIM_LIMIT"))
	if err != nil || limit < 1 {
		limit = 5
	}
	workerID := os.Getenv("NOTICECONTROL_WORKER_ID")
	if workerID == "" {
		workerID = "go-worker-local"
	}
	return Config{
		Environment:      env,
		NoticeControlURL: os.Getenv("NOTICECONTROL_APP_URL"),
		SigningSecret:    os.Getenv("ADD_ON_INTERNAL_SIGNING_SECRET"),
		WorkerID:         workerID,
		ClaimLimit:       limit,
	}
}

func (config Config) ValidateRuntime() error {
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
	return nil
}
