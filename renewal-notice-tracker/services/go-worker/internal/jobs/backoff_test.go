package jobs

import (
	"testing"
	"time"
)

func TestRetryDelayBacksOffAndCaps(t *testing.T) {
	base := 5 * time.Second
	cases := []struct {
		failures int
		want     time.Duration
	}{
		{0, 5 * time.Second},
		{1, 5 * time.Second},
		{2, 10 * time.Second},
		{4, 40 * time.Second},
		{8, 60 * time.Second},
	}
	for _, testCase := range cases {
		if got := RetryDelay(base, testCase.failures); got != testCase.want {
			t.Fatalf("failures=%d: got %s, want %s", testCase.failures, got, testCase.want)
		}
	}
}
