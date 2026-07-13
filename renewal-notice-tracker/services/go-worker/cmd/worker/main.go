package main

import (
	"flag"
	"fmt"

	"noticecontrol/go-worker/internal/health"
)

func main() {
	healthOnly := flag.Bool("health", false, "print worker health and exit")
	flag.Parse()

	if *healthOnly {
		fmt.Println(health.Status().Status)
		return
	}

	fmt.Println("noticecontrol go worker scaffold")
}
