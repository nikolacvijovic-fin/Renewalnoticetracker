from fastapi.testclient import TestClient
import hashlib
import hmac
import json
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


def test_reconcile_usage_matches_contract_candidates_with_sufficient_evidence(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","usage_import_batch_id":"batch-1","matching_mode":"balanced",'
        '"normalized_rows":[{'
        '"usage_row_id":"row-1","vendor":"Microsoft","product":"Microsoft 365 E3","normalized_product":"microsoft 365 e3",'
        '"annual_reviewed_cost":24000,"currency":"USD","purchased_seats":100,"active_users_30d":40,"confidence":0.9'
        '}],"contract_candidates":[{'
        '"contract_id":"contract-1","vendor":"Microsoft","title":"Microsoft 365 E3 renewal",'
        '"renewal_date":"2026-12-31","notice_deadline_date":"2026-11-30","annual_cost":24000,"currency":"USD"'
        '}]}'
    )
    response = client.post("/reconcile-usage", content=body, headers=signed_headers("POST", "/reconcile-usage", body))

    assert response.status_code == 200
    payload = response.json()
    assert payload["matched_count"] == 1
    assert payload["unmatched_count"] == 0
    assert all(finding["matched_contract_ids"] == ["contract-1"] for finding in payload["findings"])


def test_reconcile_usage_does_not_attach_ambiguous_contract_match(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","usage_import_batch_id":"batch-1","matching_mode":"balanced",'
        '"normalized_rows":[{'
        '"usage_row_id":"row-1","vendor":"Microsoft","product":"Microsoft 365","normalized_product":"microsoft 365",'
        '"annual_reviewed_cost":24000,"currency":"USD","purchased_seats":100,"active_users_30d":0,"confidence":0.9'
        '}],"contract_candidates":['
        '{"contract_id":"contract-1","vendor":"Microsoft","title":"Microsoft 365 E3 renewal"},'
        '{"contract_id":"contract-2","vendor":"Microsoft","title":"Microsoft 365 E5 renewal"}'
        ']}'
    )
    response = client.post("/reconcile-usage", content=body, headers=signed_headers("POST", "/reconcile-usage", body))

    assert response.status_code == 200
    payload = response.json()
    assert payload["matched_count"] == 0
    assert payload["unmatched_count"] == 1
    assert payload["findings"][0]["matched_contract_ids"] == []
    assert "ambiguous_contract_match" in payload["findings"][0]["warnings"]


def test_reconcile_usage_keeps_unmatched_rows_unattached(monkeypatch):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = (
        '{"organization_id":"org-1","usage_import_batch_id":"batch-1","matching_mode":"balanced",'
        '"normalized_rows":[{'
        '"usage_row_id":"row-1","vendor":"Microsoft","product":"Microsoft 365 E3","normalized_product":"microsoft 365 e3",'
        '"annual_reviewed_cost":24000,"currency":"USD","purchased_seats":100,"active_users_30d":0,"confidence":0.9'
        '}],"contract_candidates":[{"contract_id":"contract-1","vendor":"Salesforce","title":"Salesforce renewal"}]}'
    )
    response = client.post("/reconcile-usage", content=body, headers=signed_headers("POST", "/reconcile-usage", body))

    assert response.status_code == 200
    payload = response.json()
    assert payload["matched_count"] == 0
    assert payload["unmatched_count"] == 1
    assert all(finding["matched_contract_ids"] == [] for finding in payload["findings"])


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


def post_reconciliation(monkeypatch, payload):
    monkeypatch.setenv("ADD_ON_INTERNAL_SIGNING_SECRET", SECRET)
    body = json.dumps(payload, separators=(",", ":"))
    return client.post("/reconcile-usage", content=body, headers=signed_headers("POST", "/reconcile-usage", body))


def cross_provider_payload(google_active=10, microsoft_active=80, google_cost=12000, google_currency="USD"):
    return {
        "organization_id": "org-1",
        "usage_import_batch_id": "batch-google",
        "matching_mode": "balanced",
        "provider_warning_codes": ["purchased_seats_unavailable_using_assigned_count"],
        "normalized_rows": [
            {
                "usage_row_id": "row-microsoft",
                "provider": "microsoft_365",
                "vendor": "Microsoft",
                "product": "Microsoft 365 Enterprise Pack",
                "normalized_product": "microsoft 365 enterprise pack",
                "annual_reviewed_cost": 24000,
                "currency": "USD",
                "purchased_seats": 100,
                "assigned_seats": 100,
                "active_users_30d": microsoft_active,
                "active_users_90d": 90,
                "collected_at": "2026-08-17T00:00:00Z",
                "confidence": 0.9,
            },
            {
                "usage_row_id": "row-google",
                "provider": "google_workspace",
                "vendor": "Google",
                "product": "Google Workspace Business Standard",
                "normalized_product": "google workspace business standard",
                "annual_reviewed_cost": google_cost,
                "currency": google_currency,
                "purchased_seats": 100,
                "assigned_seats": 100,
                "active_users_30d": google_active,
                "active_users_90d": 20,
                "collected_at": "2026-08-17T00:00:00Z",
                "confidence": 0.9,
            },
        ],
        "contract_candidates": [
            {"contract_id": "contract-microsoft", "vendor": "Microsoft", "title": "Microsoft 365 renewal", "renewal_date": "2026-12-01", "notice_deadline_date": "2026-10-01", "annual_cost": 24000, "currency": "USD"},
            {"contract_id": "contract-google", "vendor": "Google", "title": "Google Workspace renewal", "renewal_date": "2027-01-01", "notice_deadline_date": "2026-11-01", "annual_cost": google_cost, "currency": google_currency},
        ],
    }


def test_reconcile_usage_detects_evidence_backed_cross_provider_overlap(monkeypatch):
    response = post_reconciliation(monkeypatch, cross_provider_payload())
    assert response.status_code == 200
    overlaps = [item for item in response.json()["findings"] if item["finding_type"] == "possible_functional_overlap"]
    assert overlaps
    finding = overlaps[0]
    assert finding["involved_providers"] == ["microsoft_365", "google_workspace"]
    assert finding["capability_category"] in {"email_calendar", "office_editing"}
    assert finding["taxonomy_version"] == "subscription_capability_taxonomy_v1"
    assert finding["recommended_action"] == "investigate"
    assert finding["estimated_savings_min"] <= finding["estimated_savings_max"]
    assert finding["confidence"] < 0.75
    assert set(finding["matched_contract_ids"]) == {"contract-microsoft", "contract-google"}
    assert {item["contract_id"] for item in finding["evidence"]["contract_deadlines"]} == {"contract-microsoft", "contract-google"}
    assert all(item["renewal_date"] for item in finding["evidence"]["contract_deadlines"])


def test_reconcile_usage_avoids_overlap_when_both_products_are_well_adopted(monkeypatch):
    response = post_reconciliation(monkeypatch, cross_provider_payload(google_active=80, microsoft_active=85))
    assert response.status_code == 200
    assert not [item for item in response.json()["findings"] if item["finding_type"] == "possible_functional_overlap"]


def test_reconcile_usage_marks_missing_cost_without_inventing_overlap_savings(monkeypatch):
    response = post_reconciliation(monkeypatch, cross_provider_payload(google_cost=None))
    overlaps = [item for item in response.json()["findings"] if item["finding_type"] == "possible_functional_overlap"]
    assert overlaps
    assert overlaps[0]["estimated_savings"] is None
    assert "missing_reviewed_cost" in overlaps[0]["warnings"]


def test_reconcile_usage_keeps_cross_currency_savings_in_low_usage_currency(monkeypatch):
    response = post_reconciliation(monkeypatch, cross_provider_payload(google_currency="EUR"))
    overlaps = [item for item in response.json()["findings"] if item["finding_type"] == "possible_functional_overlap"]
    assert overlaps
    assert all(item["currency"] == "EUR" for item in overlaps)
    assert "USD" not in {item["currency"] for item in overlaps}


def test_reconcile_usage_uses_uniquely_matched_reviewed_contract_cost_for_live_provider_rows(monkeypatch):
    payload = cross_provider_payload()
    payload["normalized_rows"][1]["annual_reviewed_cost"] = None
    payload["normalized_rows"][1]["currency"] = None
    response = post_reconciliation(monkeypatch, payload)
    overlaps = [item for item in response.json()["findings"] if item["finding_type"] == "possible_functional_overlap"]
    assert overlaps
    assert all(item["estimated_savings_max"] is not None for item in overlaps)
    assert all(item["currency"] == "USD" for item in overlaps)
    assert all("missing_reviewed_cost" not in item["warnings"] for item in overlaps)


def test_reconcile_usage_stale_or_partial_evidence_cannot_be_high_confidence(monkeypatch):
    payload = cross_provider_payload()
    payload["normalized_rows"][0]["warning_codes"] = ["partial_activity_data"]
    payload["normalized_rows"][0]["evidence_state"] = "partial"
    payload["normalized_rows"][1]["last_activity_at"] = "2025-01-01T00:00:00Z"
    response = post_reconciliation(monkeypatch, payload)
    overlaps = [item for item in response.json()["findings"] if item["finding_type"] == "possible_functional_overlap"]
    assert overlaps
    assert all(item["confidence"] < 0.5 for item in overlaps)
    assert all("partial_activity_data" in item["warnings"] for item in overlaps)


def test_reconcile_usage_does_not_treat_google_assigned_seats_as_purchased(monkeypatch):
    payload = cross_provider_payload(google_active=0)
    google = payload["normalized_rows"][1]
    google["purchased_seats"] = None
    google["assigned_seats"] = 100
    google["annual_reviewed_cost"] = None
    payload["provider_warning_codes"].append("purchased_seats_unavailable")
    response = post_reconciliation(monkeypatch, payload)
    assert response.status_code == 200
    google_findings = [
        item for item in response.json()["findings"]
        if google["usage_row_id"] in item["source_row_ids"]
    ]
    assert google_findings
    assert all(item["recommended_action"] not in {"terminate", "reduce_seats"} for item in google_findings)
    assert all(item["estimated_savings"] is None for item in google_findings)


def test_reconcile_usage_blocks_actionable_recommendations_when_activity_mapping_is_incomplete(monkeypatch):
    payload = cross_provider_payload(google_active=0)
    payload["provider_warning_codes"].append("missing_activity_report_30d")
    payload["normalized_rows"][0]["warning_codes"] = ["unmapped_microsoft_sku"]
    payload["normalized_rows"][0]["evidence_state"] = "unmapped"
    response = post_reconciliation(monkeypatch, payload)
    assert response.status_code == 200
    assert response.json()["findings"]
    assert all(item["recommended_action"] not in {"terminate", "reduce_seats"} for item in response.json()["findings"])
    assert all(item["confidence"] < 0.5 for item in response.json()["findings"])


def test_unmapped_product_warning_does_not_downgrade_unrelated_overlap(monkeypatch):
    payload = cross_provider_payload()
    payload["normalized_rows"].append({
        "usage_row_id": "row-unmapped",
        "provider": "microsoft_365",
        "vendor": "Microsoft",
        "product": "Unknown Product",
        "normalized_product": "unknown product",
        "purchased_seats": 10,
        "assigned_seats": 10,
        "active_users_30d": None,
        "active_users_90d": None,
        "collected_at": "2026-08-17T00:00:00Z",
        "confidence": 0.3,
        "warning_codes": ["unmapped_microsoft_sku"],
        "evidence_state": "unmapped",
    })
    response = post_reconciliation(monkeypatch, payload)
    overlaps = [item for item in response.json()["findings"] if item["finding_type"] == "possible_functional_overlap"]
    assert overlaps
    assert all("row-unmapped" not in item["source_row_ids"] for item in overlaps)
    assert all("unmapped_microsoft_sku" not in item["warnings"] for item in overlaps)


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
