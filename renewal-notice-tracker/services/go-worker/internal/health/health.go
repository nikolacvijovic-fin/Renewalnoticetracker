package health

import (
	"errors"
	"os"
	"time"
)

type Health struct {
	Service string `json:"service"`
	Version string `json:"version"`
	Status  string `json:"status"`
}

func Status() Health {
	return Health{
		Service: "go-worker",
		Version: "0.1.0",
		Status:  "ok",
	}
}

func CheckHeartbeat(file string, maxAge time.Duration, now time.Time) error {
	if file == "" || maxAge <= 0 {
		return errors.New("heartbeat_config_invalid")
	}
	info, err := os.Stat(file)
	if err != nil {
		return errors.New("heartbeat_unavailable")
	}
	if now.Sub(info.ModTime()) > maxAge {
		return errors.New("heartbeat_stale")
	}
	return nil
}
