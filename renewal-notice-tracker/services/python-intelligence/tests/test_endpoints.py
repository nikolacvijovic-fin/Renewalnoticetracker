from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_extract_contract_requires_file_reference():
    response = client.post(
        "/extract-contract",
        json={
            "organization_id": "org-1",
            "contract_id": "contract-1",
            "extraction_mode": "deterministic_scaffold",
        },
    )
    assert response.status_code == 422


def test_compare_quote_is_deterministic():
    response = client.post(
        "/compare-quote",
        json={
            "organization_id": "org-1",
            "contract_id": "contract-1",
            "current_terms": {"price": 100},
            "proposed_terms": {"price": 125},
        },
    )
    assert response.status_code == 200
    assert response.json()["percent_increase"] == 25


def test_score_risk_uses_readiness_context_only():
    response = client.post(
        "/score-risk",
        json={
            "organization_id": "org-1",
            "contract_id": "contract-1",
            "readiness_context": {"missing_notice_deadline": True},
        },
    )
    assert response.status_code == 200
    assert response.json()["risk_factors"] == ["missing_notice_deadline"]
