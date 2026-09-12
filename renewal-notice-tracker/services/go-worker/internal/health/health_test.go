package health

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCheckHeartbeatAcceptsFreshAndRejectsStaleOrMissingFiles(t *testing.T) {
	file := filepath.Join(t.TempDir(), "worker.heartbeat")
	if err := os.WriteFile(file, []byte("ok"), 0600); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if err := os.Chtimes(file, now.Add(-10*time.Second), now.Add(-10*time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := CheckHeartbeat(file, 30*time.Second, now); err != nil {
		t.Fatalf("expected fresh heartbeat, got %v", err)
	}
	if err := CheckHeartbeat(file, 5*time.Second, now); err == nil {
		t.Fatal("expected stale heartbeat to fail")
	}
	if err := CheckHeartbeat(filepath.Join(t.TempDir(), "missing"), 30*time.Second, now); err == nil {
		t.Fatal("expected missing heartbeat to fail")
	}
}
