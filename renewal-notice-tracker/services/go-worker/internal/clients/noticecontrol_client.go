package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"

	"noticecontrol/go-worker/internal/auth"
)

type NoticeControlClient struct {
	BaseURL       string
	SigningSecret string
	WorkerID      string
	HTTPClient    *http.Client
}

type ClaimResponse struct {
	Jobs    []map[string]any `json:"jobs"`
	Results []map[string]any `json:"results"`
}

func (client NoticeControlClient) ClaimAndProcessTrustedReminders(ctx context.Context, limit int) (ClaimResponse, error) {
	if client.BaseURL == "" || client.SigningSecret == "" || client.WorkerID == "" {
		return ClaimResponse{}, errors.New("noticecontrol_client_not_configured")
	}
	if limit < 1 {
		limit = 1
	}

	body, err := json.Marshal(map[string]any{
		"limit": limit,
		"jobTypes": []string{"trusted_reminder_delivery"},
		"processTrustedReminders": true,
	})
	if err != nil {
		return ClaimResponse{}, err
	}

	base, err := url.Parse(client.BaseURL)
	if err != nil {
		return ClaimResponse{}, errors.New("noticecontrol_base_url_invalid")
	}
	path := "/api/internal/background-jobs/claim"
	endpoint := base.ResolveReference(&url.URL{Path: path})
	timestamp := time.Now().UTC().Format(time.RFC3339)
	bodyHash := auth.BodySHA256(body)
	signature := auth.Sign("POST", path, timestamp, bodyHash, client.SigningSecret)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return ClaimResponse{}, err
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("x-noticecontrol-worker-id", client.WorkerID)
	request.Header.Set("x-noticecontrol-timestamp", timestamp)
	request.Header.Set("x-noticecontrol-body-sha256", bodyHash)
	request.Header.Set("x-noticecontrol-signature", signature)

	httpClient := client.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	response, err := httpClient.Do(request)
	if err != nil {
		return ClaimResponse{}, errors.New("noticecontrol_claim_request_failed")
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ClaimResponse{}, errors.New("noticecontrol_claim_request_rejected")
	}

	var parsed ClaimResponse
	if err := json.NewDecoder(response.Body).Decode(&parsed); err != nil {
		return ClaimResponse{}, errors.New("noticecontrol_claim_response_invalid")
	}
	return parsed, nil
}
