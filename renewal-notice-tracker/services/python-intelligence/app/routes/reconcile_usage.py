from datetime import datetime, timezone
from collections import defaultdict
from fastapi import APIRouter

from app.models import ReconcileUsageFinding, ReconcileUsageRequest, ReconcileUsageResponse, UsageContractCandidate, UsageInventoryRow
from app.subscription_capability_taxonomy import load_subscription_capability_taxonomy, product_capabilities

router = APIRouter()
CALCULATION_VERSION = "subscription_usage_v1"
OVERLAP_CALCULATION_VERSION = "cross_provider_overlap_v1"
LOW_UTILIZATION_THRESHOLD = 0.35
STALE_DAYS = 90


@router.post("/reconcile-usage", response_model=ReconcileUsageResponse)
def reconcile_usage(request: ReconcileUsageRequest):
    rows = latest_provider_products([row for row in request.normalized_rows if not row.is_sample])
    contracts = [contract for contract in request.contract_candidates if not contract.is_sample]
    matches = match_usage_to_contracts(rows, contracts)
    findings: list[ReconcileUsageFinding] = []

    for row in rows:
        findings.extend(analyze_usage_row(row, matches.get(row.usage_row_id, [])))

    findings.extend(find_duplicate_products(rows, matches))
    findings.extend(find_cross_provider_overlaps(rows, matches, contracts, request.provider_warning_codes))

    estimated_savings = sum_unique_row_savings(findings)
    duplicate_candidates = [
        ",".join(finding.source_row_ids)
        for finding in findings
        if finding.finding_type == "duplicate_product_contract"
    ]
    waste_opportunities = sorted({finding.finding_type for finding in findings})
    matched_row_ids = {row_id for row_id, contract_matches in matches.items() if len(contract_matches) == 1}

    return ReconcileUsageResponse(
        matched_count=len(matched_row_ids),
        unmatched_count=max(0, len(rows) - len(matched_row_ids)),
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


def analyze_usage_row(row: UsageInventoryRow, matched_contract_ids: list[str]) -> list[ReconcileUsageFinding]:
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
                matched_contract_ids=matched_contract_ids,
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
                matched_contract_ids=matched_contract_ids,
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
                matched_contract_ids=matched_contract_ids,
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
                matched_contract_ids=matched_contract_ids,
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
                matched_contract_ids=matched_contract_ids,
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
                matched_contract_ids=matched_contract_ids,
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
                matched_contract_ids=matched_contract_ids,
            )
        )

    return findings


def find_duplicate_products(rows: list[UsageInventoryRow], matches: dict[str, list[str]]) -> list[ReconcileUsageFinding]:
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
                matched_contract_ids=sorted({contract_id for row in group_rows for contract_id in matches.get(row.usage_row_id, [])}),
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


def find_cross_provider_overlaps(
    rows: list[UsageInventoryRow],
    matches: dict[str, list[str]],
    contracts: list[UsageContractCandidate],
    provider_warning_codes: list[str],
) -> list[ReconcileUsageFinding]:
    taxonomy = load_subscription_capability_taxonomy()
    contracts_by_id = {contract.contract_id: contract for contract in contracts}
    by_capability: dict[str, list[tuple[UsageInventoryRow, str]]] = defaultdict(list)
    for row in latest_provider_products(rows):
        if row.provider not in {"microsoft_365", "google_workspace"}:
            continue
        for mapping in product_capabilities(row.provider, " ".join([row.product, row.normalized_product])):
            by_capability[mapping["capability"]].append((row, mapping["mapping_specificity"]))

    findings: list[ReconcileUsageFinding] = []
    for capability, mapped_rows in by_capability.items():
        microsoft = [(row, specificity) for row, specificity in mapped_rows if row.provider == "microsoft_365"]
        google = [(row, specificity) for row, specificity in mapped_rows if row.provider == "google_workspace"]
        for microsoft_row, microsoft_specificity in microsoft:
            for google_row, google_specificity in google:
                candidate = build_overlap_finding(
                    capability,
                    microsoft_row,
                    google_row,
                    microsoft_specificity,
                    google_specificity,
                    matches,
                    contracts_by_id,
                    provider_warning_codes,
                    taxonomy["version"],
                )
                if candidate is not None:
                    findings.append(candidate)
    return deduplicate_overlap_findings(findings)


def build_overlap_finding(
    capability: str,
    microsoft: UsageInventoryRow,
    google: UsageInventoryRow,
    microsoft_specificity: str,
    google_specificity: str,
    matches: dict[str, list[str]],
    contracts_by_id: dict[str, UsageContractCandidate],
    provider_warning_codes: list[str],
    taxonomy_version: str,
) -> ReconcileUsageFinding | None:
    microsoft_utilization = utilization(microsoft)
    google_utilization = utilization(google)
    if microsoft_utilization is None or google_utilization is None:
        return None
    lower_usage = microsoft if microsoft_utilization <= google_utilization else google
    lower_utilization = min(microsoft_utilization, google_utilization)
    higher_utilization = max(microsoft_utilization, google_utilization)
    if lower_utilization >= 0.35 or higher_utilization < 0.35:
        return None

    warnings = set(provider_warning_codes)
    warnings.add("possible_overlap_not_proof_of_equivalence")
    if microsoft_specificity == "suite" or google_specificity == "suite":
        warnings.add("suite_level_capability_mapping")
    if microsoft.department and google.department and microsoft.department != google.department:
        warnings.add("separate_departments_possible")
    contract_ids = sorted(set(matches.get(microsoft.usage_row_id, []) + matches.get(google.usage_row_id, [])))
    if len(matches.get(microsoft.usage_row_id, [])) > 1 or len(matches.get(google.usage_row_id, [])) > 1:
        warnings.add("ambiguous_contract_match")
    if is_stale(microsoft.last_activity_at, microsoft.collected_at) or is_stale(google.last_activity_at, google.collected_at):
        warnings.add("stale_usage_data")

    savings_max, savings_currency = recoverable_cost(
        lower_usage,
        matches.get(lower_usage.usage_row_id, []),
        contracts_by_id,
    )
    savings_min = round(savings_max * 0.5, 2) if savings_max is not None else None
    if savings_max is None:
        warnings.add("missing_reviewed_cost")
    confidence = overlap_confidence(warnings, microsoft.confidence, google.confidence)
    products = [microsoft.product, google.product]
    providers = [microsoft.provider, google.provider]
    contract_deadlines = [
        {
            "contract_id": contract_id,
            "renewal_date": contracts_by_id[contract_id].renewal_date,
            "notice_deadline_date": contracts_by_id[contract_id].notice_deadline_date,
        }
        for contract_id in contract_ids
        if contract_id in contracts_by_id
    ]
    return ReconcileUsageFinding(
        finding_type="possible_functional_overlap",
        reason_code=f"cross_provider_{capability}_uneven_adoption",
        calculation_version=OVERLAP_CALCULATION_VERSION,
        source_row_ids=[microsoft.usage_row_id, google.usage_row_id],
        matched_contract_ids=contract_ids,
        utilization=round(lower_utilization, 4),
        unused_seats=None,
        confidence=confidence,
        warnings=sorted(warnings),
        estimated_savings=savings_max,
        estimated_savings_min=savings_min,
        estimated_savings_max=savings_max,
        currency=savings_currency if savings_max is not None else None,
        recommended_action="investigate",
        involved_providers=providers,
        involved_products=products,
        capability_category=capability,
        taxonomy_version=taxonomy_version,
        evidence={
            "microsoft_utilization": round(microsoft_utilization, 4),
            "google_utilization": round(google_utilization, 4),
            "lower_usage_provider": lower_usage.provider,
            "renewal_contract_count": len(contract_ids),
            "contract_deadlines": contract_deadlines,
        },
        explanation=(
            f"{products[0]} and {products[1]} map to {capability.replace('_', ' ')}. "
            "Observed adoption is uneven, so a human should confirm department, migration, compliance, and contract context."
        ),
        recommended_human_action="Confirm product ownership and use cases before planning consolidation or seat changes.",
        fingerprint_key="|".join(sorted([capability, microsoft.provider, microsoft.product, google.provider, google.product])),
    )


def latest_provider_products(rows: list[UsageInventoryRow]) -> list[UsageInventoryRow]:
    latest: dict[tuple[str, str, str], UsageInventoryRow] = {}
    manual_rows: list[UsageInventoryRow] = []
    for row in rows:
        if row.provider not in {"microsoft_365", "google_workspace"}:
            manual_rows.append(row)
            continue
        key = (
            row.provider,
            normalize_key(row.external_product_id or row.normalized_product or row.product),
            normalize_key(row.department or ""),
        )
        if not key[1]:
            continue
        current = latest.get(key)
        if current is None or (row.collected_at or "") > (current.collected_at or ""):
            latest[key] = row
    return [*manual_rows, *latest.values()]


def utilization(row: UsageInventoryRow) -> float | None:
    if row.purchased_seats is None or row.purchased_seats <= 0 or row.active_users_30d is None:
        return None
    return max(0, min(1, row.active_users_30d / row.purchased_seats))


def recoverable_cost(
    row: UsageInventoryRow,
    matched_contract_ids: list[str],
    contracts_by_id: dict[str, UsageContractCandidate],
) -> tuple[float | None, str | None]:
    row_utilization = utilization(row)
    if row_utilization is None:
        return None, None
    reviewed_cost = row.annual_reviewed_cost
    currency = row.currency
    if reviewed_cost is None and len(matched_contract_ids) == 1:
        contract = contracts_by_id.get(matched_contract_ids[0])
        if contract is not None:
            reviewed_cost = contract.annual_cost
            currency = contract.currency
    if reviewed_cost is None or not currency:
        return None, None
    return round(reviewed_cost * max(0, 1 - row_utilization), 2), currency


def overlap_confidence(warnings: set[str], *row_confidences: float | None) -> float:
    result = min([value for value in row_confidences if value is not None] or [0.68], default=0.68)
    result = min(result, 0.72)
    penalties = {
        "suite_level_capability_mapping": 0.1,
        "ambiguous_contract_match": 0.17,
        "stale_usage_data": 0.2,
        "missing_reviewed_cost": 0.08,
        "partial_activity_data": 0.18,
        "separate_departments_possible": 0.17,
        "purchased_seats_unavailable_using_assigned_count": 0.08,
    }
    for warning, penalty in penalties.items():
        if warning in warnings:
            result -= penalty
    return round(max(0.2, min(0.72, result)), 2)


def deduplicate_overlap_findings(findings: list[ReconcileUsageFinding]) -> list[ReconcileUsageFinding]:
    unique: dict[str, ReconcileUsageFinding] = {}
    for item in findings:
        if item.fingerprint_key and item.fingerprint_key not in unique:
            unique[item.fingerprint_key] = item
    return list(unique.values())


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
    matched_contract_ids: list[str],
) -> ReconcileUsageFinding:
    ambiguity_warnings = ["ambiguous_contract_match"] if len(matched_contract_ids) > 1 else []
    return ReconcileUsageFinding(
        finding_type=finding_type,
        reason_code=reason_code,
        calculation_version=CALCULATION_VERSION,
        source_row_ids=[row.usage_row_id],
        matched_contract_ids=matched_contract_ids if len(matched_contract_ids) == 1 else [],
        utilization=utilization,
        unused_seats=unused_seats,
        confidence=round(confidence if len(matched_contract_ids) <= 1 else min(confidence, 0.55), 2),
        warnings=sorted(set([*warnings, *ambiguity_warnings])),
        estimated_savings=estimated_savings,
        currency=row.currency,
        recommended_action=recommended_action,
    )


def match_usage_to_contracts(
    rows: list[UsageInventoryRow],
    contracts: list[UsageContractCandidate],
) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    normalized_contracts = [
        (
            contract,
            normalize_key(" ".join(filter(None, [contract.vendor, contract.title]))),
            normalize_key(contract.vendor or ""),
        )
        for contract in contracts
    ]

    for row in rows:
        usage_key = normalize_key(" ".join(filter(None, [row.vendor, row.product, row.normalized_product])))
        if not usage_key:
            result[row.usage_row_id] = []
            continue
        scored: list[tuple[float, str]] = []
        row_vendor = normalize_key(row.vendor or "")
        for contract, contract_key, contract_vendor in normalized_contracts:
            score = match_score(usage_key, contract_key)
            if row_vendor and contract_vendor and row_vendor == contract_vendor:
                score = max(score, 0.9)
            if score >= 0.72:
                scored.append((score, contract.contract_id))
        if not scored:
            result[row.usage_row_id] = []
            continue
        scored.sort(reverse=True)
        top_score = scored[0][0]
        strong = [contract_id for score, contract_id in scored if score >= top_score - 0.08]
        result[row.usage_row_id] = strong[:3]

    return result


def match_score(usage_key: str, contract_key: str) -> float:
    if not usage_key or not contract_key:
        return 0
    if usage_key == contract_key:
        return 1
    if usage_key in contract_key or contract_key in usage_key:
        return 0.88
    usage_tokens = set(usage_key.split())
    contract_tokens = set(contract_key.split())
    if not usage_tokens or not contract_tokens:
        return 0
    overlap = len(usage_tokens & contract_tokens)
    return overlap / min(len(usage_tokens), len(contract_tokens))


def normalize_key(value: str) -> str:
    return " ".join(
        value.lower()
        .replace("-", " ")
        .replace("_", " ")
        .replace(".", " ")
        .split()
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
