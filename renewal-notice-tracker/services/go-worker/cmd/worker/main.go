package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"noticecontrol/go-worker/internal/clients"
	"noticecontrol/go-worker/internal/config"
	"noticecontrol/go-worker/internal/health"
	"noticecontrol/go-worker/internal/jobs"
)

func logEvent(level string, event string, metadata map[string]any) {
	payload := map[string]any{
		"level": level,
		"event": event,
		"service": "reminder-worker",
		"logged_at": time.Now().UTC().Format(time.RFC3339Nano),
	}
	for key, value := range metadata {
		payload[key] = value
	}
	encoded, _ := json.Marshal(payload)
	fmt.Println(string(encoded))
}

func main() {
	healthOnly := flag.Bool("health", false, "print worker health and exit")
	once := flag.Bool("once", false, "poll once and exit")
	flag.Parse()

	if *healthOnly {
		fmt.Println(health.Status().Status)
		return
	}

	workerConfig := config.Load()
	if err := workerConfig.ValidateRuntime(); err != nil {
		logEvent("error", "reminder_worker_config_invalid", map[string]any{"error": err.Error()})
		os.Exit(1)
	}

	loop := jobs.WorkerLoop{
		Client: clients.NoticeControlClient{
			BaseURL:       workerConfig.NoticeControlURL,
			SigningSecret: workerConfig.SigningSecret,
			WorkerID:      workerConfig.WorkerID,
		},
		Limit: workerConfig.ClaimLimit,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	consecutiveFailures := 0
	for {
		result, err := loop.RunOnce(ctx)
		if err != nil {
			if ctx.Err() != nil {
				logEvent("info", "reminder_worker_stopped", map[string]any{"reason": "signal"})
				return
			}
			consecutiveFailures++
			logEvent("error", "reminder_worker_poll_failed", map[string]any{"consecutive_failures": consecutiveFailures, "error": err.Error()})
			if *once || consecutiveFailures >= workerConfig.MaxConsecutiveFailures {
				logEvent("error", "reminder_worker_failure_threshold_reached", map[string]any{"consecutive_failures": consecutiveFailures})
				os.Exit(1)
			}
		} else {
			consecutiveFailures = 0
			if len(result.Jobs) > 0 {
				logEvent("info", "reminder_worker_poll_succeeded", map[string]any{"claimed": len(result.Jobs), "processed": len(result.Results)})
			}
			if *once {
				return
			}
		}

		timer := time.NewTimer(jobs.RetryDelay(workerConfig.PollInterval, consecutiveFailures))
		select {
		case <-ctx.Done():
			timer.Stop()
			logEvent("info", "reminder_worker_stopped", map[string]any{"reason": "signal"})
			return
		case <-timer.C:
		}
	}
}
