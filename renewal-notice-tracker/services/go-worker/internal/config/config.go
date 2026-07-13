package config

import "os"

type Config struct {
	Environment string
}

func Load() Config {
	env := os.Getenv("NOTICECONTROL_WORKER_ENV")
	if env == "" {
		env = "development"
	}
	return Config{Environment: env}
}
