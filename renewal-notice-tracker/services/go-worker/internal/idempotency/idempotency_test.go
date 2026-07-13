package idempotency

import "testing"

func TestClaimOnlyAllowsFirstUse(t *testing.T) {
	store := NewStore()
	if !store.Claim("job-1") {
		t.Fatal("expected first claim to succeed")
	}
	if store.Claim("job-1") {
		t.Fatal("expected duplicate claim to fail")
	}
}
