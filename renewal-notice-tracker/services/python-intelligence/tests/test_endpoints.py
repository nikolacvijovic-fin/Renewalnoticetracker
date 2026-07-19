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
    assert response.json()["percent_increase"] == 25


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
