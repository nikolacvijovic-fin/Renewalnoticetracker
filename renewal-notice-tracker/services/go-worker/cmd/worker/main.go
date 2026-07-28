package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"noticecontrol/go-worker/internal/clients"
	"noticecontrol/go-worker/internal/config"
	"noticecontrol/go-worker/internal/health"
	"noticecontrol/go-worker/internal/jobs"
)

func main() {
	healthOnly := flag.Bool("health", false, "print worker health and exit")
	flag.Parse()

	if *healthOnly {
		fmt.Println(health.Status().Status)
		return
	}

	workerConfig := config.Load()
	if err := workerConfig.ValidateRuntime(); err != nil {
		fmt.Println(err.Error())
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
	result, err := loop.RunOnce(context.Background())
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	}
	fmt.Printf("claimed=%d processed=%d\n", len(result.Jobs), len(result.Results))
}
