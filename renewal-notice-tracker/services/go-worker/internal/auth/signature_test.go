package auth

import (
	"testing"
	"time"
)

func TestVerifyAcceptsValidSignature(t *testing.T) {
	now := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	body := []byte(`{"organization_id":"org-1"}`)
	bodyHash := BodySHA256(body)
	timestamp := now.Format(time.RFC3339)
	signature := Sign("POST", "/jobs", timestamp, bodyHash, "secret")

	err := Verify(SignedRequest{
		Method:    "POST",
		Path:      "/jobs",
		Timestamp: timestamp,
		Body:      body,
		BodyHash:  bodyHash,
		Signature: signature,
	}, "secret", now)

	if err != nil {
		t.Fatalf("expected signature to verify: %v", err)
	}
}

func TestVerifyRejectsInvalidAndExpiredSignatures(t *testing.T) {
	now := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	body := []byte(`{"organization_id":"org-1"}`)
	bodyHash := BodySHA256(body)

	err := Verify(SignedRequest{
		Method:    "POST",
		Path:      "/jobs",
		Timestamp: now.Format(time.RFC3339),
		Body:      body,
		BodyHash:  bodyHash,
		Signature: "sha256=bad",
	}, "secret", now)
	if err == nil || err.Error() != "invalid_signature" {
		t.Fatalf("expected invalid_signature, got %v", err)
	}

	expired := now.Add(-10 * time.Minute)
	err = Verify(SignedRequest{
		Method:    "POST",
		Path:      "/jobs",
		Timestamp: expired.Format(time.RFC3339),
		Body:      body,
		BodyHash:  bodyHash,
		Signature: Sign("POST", "/jobs", expired.Format(time.RFC3339), bodyHash, "secret"),
	}, "secret", now)
	if err == nil || err.Error() != "expired_signature_timestamp" {
		t.Fatalf("expected expired_signature_timestamp, got %v", err)
	}
}

func TestVerifyRejectsBodyHashMismatch(t *testing.T) {
	now := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	body := []byte(`{"organization_id":"org-1"}`)
	tamperedHash := BodySHA256([]byte(`{"organization_id":"org-2"}`))
	timestamp := now.Format(time.RFC3339)
	signature := Sign("POST", "/jobs", timestamp, tamperedHash, "secret")

	err := Verify(SignedRequest{
		Method:    "POST",
		Path:      "/jobs",
		Timestamp: timestamp,
		Body:      body,
		BodyHash:  tamperedHash,
		Signature: signature,
	}, "secret", now)

	if err == nil || err.Error() != "body_hash_mismatch" {
		t.Fatalf("expected body_hash_mismatch, got %v", err)
	}
}
