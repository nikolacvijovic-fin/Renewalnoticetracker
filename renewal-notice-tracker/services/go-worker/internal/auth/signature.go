package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

const MaxSkew = 5 * time.Minute

type SignedRequest struct {
	Method    string
	Path      string
	Timestamp string
	Body      []byte
	BodyHash  string
	Signature string
}

func BodySHA256(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func Sign(method string, path string, timestamp string, bodyHash string, secret string) string {
	payload := strings.Join([]string{strings.ToUpper(method), path, timestamp, bodyHash}, "\n")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func Verify(request SignedRequest, secret string, now time.Time) error {
	if secret == "" {
		return errors.New("signature_secret_not_configured")
	}
	if request.Timestamp == "" || request.BodyHash == "" || request.Signature == "" {
		return errors.New("missing_signature_headers")
	}
	parsed, err := time.Parse(time.RFC3339, request.Timestamp)
	if err != nil {
		return errors.New("invalid_signature_timestamp")
	}
	if now.Sub(parsed) > MaxSkew || parsed.Sub(now) > MaxSkew {
		return errors.New("expired_signature_timestamp")
	}
	if !hmac.Equal([]byte(BodySHA256(request.Body)), []byte(request.BodyHash)) {
		return errors.New("body_hash_mismatch")
	}
	expected := Sign(request.Method, request.Path, request.Timestamp, request.BodyHash, secret)
	if !hmac.Equal([]byte(expected), []byte(request.Signature)) {
		return errors.New("invalid_signature")
	}
	return nil
}
