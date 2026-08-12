from datetime import datetime, timezone
from collections import defaultdict
from fastapi import APIRouter

from app.models import ReconcileUsageFinding, ReconcileUsageRequest, ReconcileUsageResponse, UsageInventoryRow

router = APIRouter()
CALCULATION_VERSION = "subscription_usage_v1"
LOW_UTILIZATION_THRESHOLD = 0.35
STALE_DAYS = 90


@router.post("/reconcile-usage", response_model=ReconcileUsageResponse)
def reconcile_usage(request: ReconcileUsageRequest):
    rows = [row for row in request.normalized_rows if not row.is_sample]
    findings: list[ReconcileUsageFinding] = []

    for row in rows:
        findings.extend(analyze_usage_row(row))

    findings.extend(find_duplicate_products(rows))

    estimated_savings = sum_unique_row_savings(findings)
    duplicate_candidates = [
        ",".join(finding.source_row_ids)
        for finding in findings
        if finding.finding_type == "duplicate_product_contract"
    ]
    waste_opportunities = sorted({finding.finding_type for finding in findings})

    return ReconcileUsageResponse(
        matched_count=0,
        unmatched_count=len(rows),
        duplicate_candidates=duplicate_candidates,
        waste_opportunities=waste_opportunities,
        estimated_savings=round(estimated_savings, 2),
        findings=findings,
    )


def sum_unique_row_savings(findings: list[ReconcileUsageFinding]) -> float:
    by_row: dict[str, float] = {}
    for item in findings:
        if item.estimated_savings is None:
            continue
        for row_id in item.source_row_ids:
            by_row[row_id] = max(by_row.get(row_id, 0), item.estimated_savings)
    return round(sum(by_row.values()), 2)


def analyze_usage_row(row: UsageInventoryRow) -> list[ReconcileUsageFinding]:
    findings: list[ReconcileUsageFinding] = []
    purchased = row.purchased_seats
    active_30d = row.active_users_30d
    warnings: list[str] = []

    if purchased is None or purchased <= 0:
        warnings.append("missing_or_zero_purchased_seats")
        findings.append(
            finding(
                row,
                "renewal_decision_required",
                "missing_usage_denominator",
                None,
                None,
                None,
                "insufficient_evidence",
                warnings,
                confidence=0.4,
            )
        )
        return findings

    if active_30d is None:
        findings.append(
            finding(
                row,
                "renewal_decision_required",
                "missing_active_users_30d",
                None,
                None,
                None,
                "insufficient_evidence",
                ["missing_active_users_30d"],
                confidence=0.45,
            )
        )
        return findings

    utilization = round(active_30d / purchased, 4)
    unused_seats = max(purchased - active_30d, 0)
    estimated_savings = calculate_savings(row, unused_seats, warnings)

    if active_30d == 0:
        findings.append(
            finding(
                row,
                "unused_subscription",
                "zero_active_users_30d",
                utilization,
                unused_seats,
                estimated_savings,
                "terminate",
                warnings,
                confidence=confidence(row, 0.85),
            )
        )
    elif utilization < LOW_UTILIZATION_THRESHOLD:
        findings.append(
            finding(
                row,
                "low_utilization",
                "active_users_below_threshold",
                utilization,
                unused_seats,
                estimated_savings,
                "reduce_seats",
                warnings,
                confidence=confidence(row, 0.78),
            )
        )

    if unused_seats > 0 and estimated_savings is not None:
        findings.append(
            finding(
                row,
                "unused_seats",
                "purchased_seats_exceed_active_users_30d",
                utilization,
                unused_seats,
                estimated_savings,
                "reduce_seats",
                warnings,
                confidence=confidence(row, 0.8),
            )
        )

    if estimated_savings is not None and estimated_savings >= 5000 and utilization < 0.5:
        findings.append(
            finding(
                row,
                "high_cost_low_usage",
                "high_cost_low_utilization",
                utilization,
                unused_seats,
                estimated_savings,
                "renegotiate",
                warnings,
                confidence=confidence(row, 0.74),
            )
        )

    if is_stale(row.last_activity_at, row.collected_at):
        findings.append(
            finding(
                row,
                "stale_usage_data",
                "last_activity_or_collection_stale",
                utilization,
                unused_seats,
                None,
                "insufficient_evidence",
                ["stale_usage_data"],
                confidence=0.5,
            )
        )

    return findings


def find_duplicate_products(rows: list[UsageInventoryRow]) -> list[ReconcileUsageFinding]:
    grouped: dict[str, list[UsageInventoryRow]] = defaultdict(list)
    for row in rows:
        key = (row.normalized_product or row.product or "").strip().lower()
        if key:
            grouped[key].append(row)

    findings: list[ReconcileUsageFinding] = []
    for group_rows in grouped.values():
        if len(group_rows) < 2:
            continue
        currency = group_rows[0].currency
        savings = sum(row.annual_reviewed_cost or 0 for row in group_rows[1:] if row.currency == currency)
        findings.append(
            ReconcileUsageFinding(
                finding_type="duplicate_product_contract",
                reason_code="same_normalized_product_multiple_rows",
                calculation_version=CALCULATION_VERSION,
                source_row_ids=[row.usage_row_id for row in group_rows],
                matched_contract_ids=[],
                utilization=None,
                unused_seats=None,
                confidence=0.62,
                warnings=["possible_overlap_not_proof_of_equivalence"],
                estimated_savings=round(savings, 2) if savings > 0 else None,
                currency=currency,
                recommended_action="consolidate",
            )
        )
    return findings


def calculate_savings(row: UsageInventoryRow, unused_seats: float, warnings: list[str]) -> float | None:
    if row.annual_reviewed_cost is None or row.purchased_seats is None or row.purchased_seats <= 0:
        warnings.append("missing_price_per_seat_basis")
        return None
    reviewed_price_per_seat = row.annual_reviewed_cost / row.purchased_seats
    return round(unused_seats * reviewed_price_per_seat, 2)


def finding(
    row: UsageInventoryRow,
    finding_type: str,
    reason_code: str,
    utilization: float | None,
    unused_seats: float | None,
    estimated_savings: float | None,
    recommended_action: str,
    warnings: list[str],
    confidence: float,
) -> ReconcileUsageFinding:
    return ReconcileUsageFinding(
        finding_type=finding_type,
        reason_code=reason_code,
        calculation_version=CALCULATION_VERSION,
        source_row_ids=[row.usage_row_id],
        matched_contract_ids=[],
        utilization=utilization,
        unused_seats=unused_seats,
        confidence=round(confidence, 2),
        warnings=sorted(set(warnings)),
        estimated_savings=estimated_savings,
        currency=row.currency,
        recommended_action=recommended_action,
    )


def confidence(row: UsageInventoryRow, base: float) -> float:
    if row.confidence is None:
        return base
    return min(base, max(0, row.confidence))


def is_stale(last_activity_at: str | None, collected_at: str | None) -> bool:
    reference = parse_datetime(collected_at) or datetime.now(timezone.utc)
    last_activity = parse_datetime(last_activity_at)
    if not last_activity:
        return False
    return (reference - last_activity).days > STALE_DAYS


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None
