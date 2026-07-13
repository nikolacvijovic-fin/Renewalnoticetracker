package health

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
