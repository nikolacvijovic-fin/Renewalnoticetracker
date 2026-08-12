from fastapi.testclient import TestClient
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from app.main import app

client = TestClient(app)
SECRET = "test-add-on-secret"


def signed_headers(method: str, path: str, body: str, secret: str = SECRET, timestamp: str | None = None):
    timestamp = timestamp or datetime.now(timezone.utc).isoformat()
    body_hash = hashlib.sha256(body.encode()).hexdigest()
    payload = "\n".join([method.upper(), path, timestamp, body_hash])
    return {
        "x-noticecontrol-timestamp": timestamp,
        "x-noticecontrol-body-sha256": body_hash,
        "x-noticecontrol-signature": "sha256=" + hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest(),
        "content-type": "application/json",
    }


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_extract_contract_requires_file_reference(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","contract_id":"contract-1",'
        '"extraction_mode":"deterministic_scaffold"}'
    )
    response = client.post(
        "/extract-contract",
        content=body,
        headers=signed_headers("POST", "/extract-contract", body),
    )
    assert response.status_code == 422


def test_extract_contract_detects_evidence_backed_fields(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","contract_id":"contract-1","file_id":"file-1",'
        '"extraction_mode":"deterministic_scaffold",'
        '"sample_text":"The SaaS subscription renews automatically on 2030-06-30. '
        'Customer must give 60 days notice before renewal. Fees are USD 12,500. Net 30 payment terms apply."}'
    )
    response = client.post(
        "/extract-contract",
        content=body,
        headers=signed_headers("POST", "/extract-contract", body),
    )

    assert response.status_code == 200
    payload = response.json()
    keys = {field["field_key"] for field in payload["fields"]}
    assert "renewal_date" in keys
    assert "auto_renewal" in keys
    assert "termination_window" in keys
    assert "contract_value_amount" in keys
    assert "contract_value_currency" in keys
    assert payload["overall_confidence"] > 0
    for field in payload["fields"]:
        assert 0 <= field["confidence"] <= 1
        assert field["citations"]
        assert "raw contract text" not in field["citations"][0]["snippet"].lower()


def test_extract_contract_returns_missing_evidence_warning_without_raw_text(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","contract_id":"contract-1",'
        '"extraction_mode":"deterministic_scaffold","sample_text":"nothing useful here"}'
    )
    response = client.post(
        "/extract-contract",
        content=body,
        headers=signed_headers("POST", "/extract-contract", body),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["fields"] == []
    assert "no_supported_fields_detected" in payload["warnings"]
    assert "nothing useful here" not in str(payload)


def test_compare_quote_is_deterministic(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","contract_id":"contract-1",'
        '"current_terms":{"price":100},"proposed_terms":{"price":125}}'
    )
    response = client.post(
        "/compare-quote",
        content=body,
        headers=signed_headers("POST", "/compare-quote", body),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["price_delta_percent"] == 25
    assert payload["overall_risk_level"] == "critical"
    assert payload["findings"][0]["finding_type"] == "price_increase"


def test_compare_quote_detects_discount_and_term_changes(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","contract_id":"contract-1",'
        '"current_terms":{"price":100,"discounts":["20% discount"],"payment_terms":"Net 60","renewal_term":"12 months"},'
        '"proposed_terms":{"price":105,"discounts":[],"payment_terms":"Annual prepaid","renewal_term":"36 months"}}'
    )
    response = client.post(
        "/compare-quote",
        content=body,
        headers=signed_headers("POST", "/compare-quote", body),
    )

    assert response.status_code == 200
    finding_types = {finding["finding_type"] for finding in response.json()["findings"]}
    assert "discount_removed" in finding_types
    assert "payment_terms_changed" in finding_types
    assert "renewal_term_changed" in finding_types


def test_compare_quote_uses_quote_text_without_returning_raw_body(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","contract_id":"contract-1",'
        '"current_terms":{"price":100,"currency":"USD"},'
        '"proposed_terms":{},'
        '"quote_text":"RAW QUOTE TEXT SHOULD NOT LEAK. Renewal total USD 125. Net 30."}'
    )
    response = client.post(
        "/compare-quote",
        content=body,
        headers=signed_headers("POST", "/compare-quote", body),
    )

    assert response.status_code == 200
    payload_text = str(response.json())
    assert response.json()["proposed_total_amount"] == 125
    assert "RAW QUOTE TEXT SHOULD NOT LEAK" not in payload_text
    assert "deterministic_scaffold_no_provider_backed_ai" in response.json()["warnings"]


def test_score_risk_uses_readiness_context_only(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","contract_id":"contract-1",'
        '"readiness_context":{"missing_notice_deadline":true}}'
    )
    response = client.post(
        "/score-risk",
        content=body,
        headers=signed_headers("POST", "/score-risk", body),
    )
    assert response.status_code == 200
    assert response.json()["risk_factors"] == ["missing_notice_deadline"]


def test_reconcile_usage_returns_deterministic_savings_findings(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","usage_import_batch_id":"batch-1","matching_mode":"balanced",'
        '"normalized_rows":[{'
        '"usage_row_id":"row-1","vendor":"Acme","product":"Acme Suite","normalized_product":"acme suite",'
        '"annual_reviewed_cost":12000,"currency":"USD","purchased_seats":100,'
        '"active_users_30d":20,"active_users_90d":35,"last_activity_at":"2026-08-01T00:00:00Z",'
        '"collected_at":"2026-08-12T00:00:00Z","confidence":0.9'
        '}],"contract_candidates":[]}'
    )
    response = client.post(
        "/reconcile-usage",
        content=body,
        headers=signed_headers("POST", "/reconcile-usage", body),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["estimated_savings"] == 9600
    finding_types = {finding["finding_type"] for finding in payload["findings"]}
    assert "low_utilization" in finding_types
    assert "unused_seats" in finding_types
    assert payload["findings"][0]["calculation_version"] == "subscription_usage_v1"


def test_reconcile_usage_never_invents_missing_price_per_seat(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","usage_import_batch_id":"batch-1","matching_mode":"balanced",'
        '"normalized_rows":[{'
        '"usage_row_id":"row-1","vendor":"Acme","product":"Acme Suite","normalized_product":"acme suite",'
        '"currency":"USD","purchased_seats":100,"active_users_30d":0,"confidence":0.9'
        '}],"contract_candidates":[]}'
    )
    response = client.post(
        "/reconcile-usage",
        content=body,
        headers=signed_headers("POST", "/reconcile-usage", body),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["estimated_savings"] == 0
    assert payload["findings"][0]["estimated_savings"] is None
    assert "missing_price_per_seat_basis" in payload["findings"][0]["warnings"]


def test_reconcile_usage_handles_zero_seats_and_stale_data(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","usage_import_batch_id":"batch-1","matching_mode":"balanced",'
        '"normalized_rows":[{'
        '"usage_row_id":"row-1","vendor":"Acme","product":"Acme Suite","normalized_product":"acme suite",'
        '"annual_reviewed_cost":12000,"currency":"USD","purchased_seats":0,'
        '"active_users_30d":0,"last_activity_at":"2026-01-01T00:00:00Z",'
        '"collected_at":"2026-08-12T00:00:00Z","confidence":0.9'
        '}],"contract_candidates":[]}'
    )
    response = client.post(
        "/reconcile-usage",
        content=body,
        headers=signed_headers("POST", "/reconcile-usage", body),
    )

    assert response.status_code == 200
    assert response.json()["findings"][0]["reason_code"] == "missing_usage_denominator"


def test_reconcile_usage_detects_duplicate_products_and_excludes_samples(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","usage_import_batch_id":"batch-1","matching_mode":"balanced",'
        '"normalized_rows":['
        '{"usage_row_id":"row-1","vendor":"Acme","product":"Suite","normalized_product":"suite","annual_reviewed_cost":1000,"currency":"USD","purchased_seats":10,"active_users_30d":5},'
        '{"usage_row_id":"row-2","vendor":"Other","product":"Suite","normalized_product":"suite","annual_reviewed_cost":500,"currency":"USD","purchased_seats":10,"active_users_30d":5},'
        '{"usage_row_id":"row-sample","vendor":"Demo","product":"Suite","normalized_product":"suite","annual_reviewed_cost":9999,"currency":"USD","purchased_seats":10,"active_users_30d":0,"is_sample":true}'
        '],"contract_candidates":[]}'
    )
    response = client.post(
        "/reconcile-usage",
        content=body,
        headers=signed_headers("POST", "/reconcile-usage", body),
    )

    assert response.status_code == 200
    payload = response.json()
    duplicate = [finding for finding in payload["findings"] if finding["finding_type"] == "duplicate_product_contract"][0]
    assert duplicate["source_row_ids"] == ["row-1", "row-2"]
    assert "row-sample" not in str(payload)


def test_invalid_signature_rejected(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = '{"organization_id":"org-1","contract_id":"contract-1","readiness_context":{}}'
    headers = signed_headers("POST", "/score-risk", body)
    headers["x-noticecontrol-signature"] = "sha256=bad"
    response = client.post("/score-risk", content=body, headers=headers)
    assert response.status_code == 401


def test_expired_signature_rejected(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = '{"organization_id":"org-1","contract_id":"contract-1","readiness_context":{}}'
    expired = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    response = client.post("/score-risk", content=body, headers=signed_headers("POST", "/score-risk", body, timestamp=expired))
    assert response.status_code == 401
    assert response.json()["detail"] == "expired_signature_timestamp"


def test_body_hash_mismatch_rejected(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = '{"organization_id":"org-1","contract_id":"contract-1","readiness_context":{}}'
    headers = signed_headers("POST", "/score-risk", body)
    headers["x-noticecontrol-body-sha256"] = hashlib.sha256(b"tampered").hexdigest()
    response = client.post("/score-risk", content=body, headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "body_hash_mismatch"
