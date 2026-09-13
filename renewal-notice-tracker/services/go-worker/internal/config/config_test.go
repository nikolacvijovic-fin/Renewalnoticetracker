package config

import (
	"testing"
	"time"
)

func TestLoadRejectsOutOfBoundsRuntimeValues(t *testing.T) {
	t.Setenv("NOTICECONTROL_APP_URL", "https://app.example.test")
	t.Setenv("ADD_ON_INTERNAL_SIGNING_SECRET", "signing-secret")
	t.Setenv("NOTICECONTROL_WORKER_POLL_INTERVAL_MS", "10")
	t.Setenv("NOTICECONTROL_WORKER_CLAIM_LIMIT", "500")
	t.Setenv("NOTICECONTROL_WORKER_MAX_CONSECUTIVE_FAILURES", "0")
	t.Setenv("NOTICECONTROL_WORKER_HEARTBEAT_MAX_AGE_SECONDS", "1")

	loaded := Load()
	if loaded.PollInterval != 5*time.Second {
		t.Fatalf("expected safe poll default, got %s", loaded.PollInterval)
	}
	if loaded.ClaimLimit != 5 || loaded.MaxConsecutiveFailures != 5 {
		t.Fatalf("expected bounded defaults, got %+v", loaded)
	}
	if err := loaded.ValidateRuntime(); err == nil {
		t.Fatal("expected invalid explicit runtime configuration to fail validation")
	}
}

func TestLoadAcceptsExplicitRuntimeBounds(t *testing.T) {
	t.Setenv("NOTICECONTROL_APP_URL", "https://app.example.test")
	t.Setenv("ADD_ON_INTERNAL_SIGNING_SECRET", "signing-secret")
	t.Setenv("NOTICECONTROL_WORKER_POLL_INTERVAL_MS", "1500")
	t.Setenv("NOTICECONTROL_WORKER_CLAIM_LIMIT", "7")
	t.Setenv("NOTICECONTROL_WORKER_MAX_CONSECUTIVE_FAILURES", "9")
	t.Setenv("NOTICECONTROL_WORKER_HEARTBEAT_FILE", "/tmp/reminder-worker-test.heartbeat")
	t.Setenv("NOTICECONTROL_WORKER_HEARTBEAT_MAX_AGE_SECONDS", "30")

	loaded := Load()
	if loaded.PollInterval != 1500*time.Millisecond || loaded.ClaimLimit != 7 || loaded.MaxConsecutiveFailures != 9 {
		t.Fatalf("unexpected explicit config: %+v", loaded)
	}
	if loaded.HeartbeatFile != "/tmp/reminder-worker-test.heartbeat" || loaded.HeartbeatMaxAge != 30*time.Second {
		t.Fatalf("unexpected heartbeat config: %+v", loaded)
	}
}
