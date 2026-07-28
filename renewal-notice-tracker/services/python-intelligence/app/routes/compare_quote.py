import re
from typing import Any

from fastapi import APIRouter

from app.models import (
    CompareQuoteCitation,
    CompareQuoteFinding,
    CompareQuoteRequest,
    CompareQuoteResponse,
    CompareQuoteSavingsOpportunity,
)

router = APIRouter()

MONEY_PATTERN = re.compile(r"(?P<currency>USD|EUR|GBP|\$|€|£)?\s?(?P<amount>\d[\d,]*(?:\.\d{1,2})?)", re.IGNORECASE)


def _safe_snippet(value: str | None, limit: int = 180) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    if not cleaned:
        return None
    return cleaned[: limit - 1] + "..." if len(cleaned) > limit else cleaned


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = MONEY_PATTERN.search(value)
        if match:
            return float(match.group("amount").replace(",", ""))
    return None


def _string(value: Any) -> str | None:
    return _safe_snippet(value, 120) if isinstance(value, str) else None


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [entry for entry in (_string(item) for item in value) if entry]


def _currency(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip().upper().replace("$", "USD").replace("€", "EUR").replace("£", "GBP")[:8]
    return None


def _terms(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "total_amount": _number(raw.get("total_amount"))
        or _number(raw.get("totalAmount"))
        or _number(raw.get("contract_value_amount"))
        or _number(raw.get("price")),
        "currency": _currency(raw.get("currency"), raw.get("contract_value_currency")),
        "discounts": _strings(raw.get("discounts")),
        "skus": _strings(raw.get("skus") or raw.get("sku_list")),
        "payment_terms": _string(raw.get("payment_terms") or raw.get("paymentTerms")),
        "renewal_term": _string(raw.get("renewal_term") or raw.get("renewalTerm")),
        "auto_renewal": raw.get("auto_renewal") if isinstance(raw.get("auto_renewal"), bool) else raw.get("autoRenewal"),
        "notice_deadline_date": _string(raw.get("notice_deadline_date") or raw.get("noticeDeadlineDate")),
    }


def _terms_with_quote_text(raw: dict[str, Any], quote_text: str | None) -> dict[str, Any]:
    terms = _terms(raw)
    if terms["total_amount"] is None and quote_text:
        match = MONEY_PATTERN.search(quote_text)
        if match:
            terms["total_amount"] = float(match.group("amount").replace(",", ""))
            terms["currency"] = terms["currency"] or _currency(match.group("currency"))
    if not terms["discounts"] and quote_text and re.search(r"\bdiscount|credit|promotion\b", quote_text, re.IGNORECASE):
        terms["discounts"] = ["quote mentions discount language"]
    if not terms["payment_terms"] and quote_text:
        payment_match = re.search(r"(net\s?\d+|annual prepaid|monthly|quarterly)", quote_text, re.IGNORECASE)
        if payment_match:
            terms["payment_terms"] = payment_match.group(1)
    if not terms["renewal_term"] and quote_text:
        term_match = re.search(r"(\d+\s?(?:month|months|year|years))", quote_text, re.IGNORECASE)
        if term_match:
            terms["renewal_term"] = term_match.group(1)
    return terms


def _severity(percent: float | None, removed_discount: bool, term_change: bool) -> str:
    value = percent or 0
    if value >= 25 or (value >= 15 and removed_discount):
        return "critical"
    if value >= 15 or removed_discount:
        return "high"
    if value >= 8 or term_change:
        return "medium"
    if value > 0:
        return "low"
    return "info"


def _removed(current: list[str], proposed: list[str]) -> list[str]:
    proposed_set = {entry.strip().lower() for entry in proposed}
    return [entry for entry in current if entry.strip().lower() not in proposed_set]


def _citation(request: CompareQuoteRequest) -> CompareQuoteCitation | None:
    if not _safe_snippet(request.quote_text):
        return None
    return CompareQuoteCitation(
        snippet="Renewal quote evidence captured as bounded structured fields.",
        evidence_label="renewal quote text",
    )


def _savings_from_finding(
    finding: CompareQuoteFinding,
    currency: str | None,
    price_delta: float | None,
) -> CompareQuoteSavingsOpportunity | None:
    if finding.finding_type not in {
        "price_increase",
        "discount_removed",
        "payment_terms_changed",
        "renewal_term_changed",
    }:
        return None
    return CompareQuoteSavingsOpportunity(
        opportunity_type=finding.finding_type,
        title="Challenge renewal price increase"
        if finding.finding_type == "price_increase"
        else "Preserve favorable renewal terms",
        estimated_savings_amount=round(price_delta, 2) if finding.finding_type == "price_increase" and price_delta and price_delta > 0 else None,
        currency=currency,
        confidence=min(finding.confidence, 0.86),
        evidence={
            "finding_type": finding.finding_type,
            "severity": finding.severity,
            "confidence": finding.confidence,
        },
    )


@router.post("/compare-quote", response_model=CompareQuoteResponse)
def compare_quote(request: CompareQuoteRequest):
    current = _terms(request.current_terms)
    proposed = _terms_with_quote_text(request.proposed_terms, request.quote_text)
    current_amount = current["total_amount"]
    proposed_amount = proposed["total_amount"]
    currency = proposed["currency"] or current["currency"]
    price_delta = round(proposed_amount - current_amount, 2) if current_amount is not None and proposed_amount is not None else None
    percent = round(price_delta / current_amount * 100, 2) if price_delta is not None and current_amount and current_amount > 0 else None
    citation = _citation(request)
    findings: list[CompareQuoteFinding] = []

    if price_delta and price_delta > 0:
        findings.append(
            CompareQuoteFinding(
                finding_type="price_increase",
                severity=_severity(percent, False, False),
                title="Renewal quote increases total cost",
                description="The proposed renewal total is higher than the current contract baseline and needs human review.",
                current_value={"amount": current_amount, "currency": current["currency"]},
                proposed_value={"amount": proposed_amount, "currency": currency},
                delta_value={"amount": price_delta, "percent": percent},
                confidence=0.9,
                citation=citation,
            )
        )

    removed_discounts = _removed(current["discounts"], proposed["discounts"])
    if removed_discounts:
        findings.append(
            CompareQuoteFinding(
                finding_type="discount_removed",
                severity="high",
                title="Discount appears removed",
                description="A discount present in the current baseline is missing from the renewal quote evidence.",
                current_value={"discounts": current["discounts"]},
                proposed_value={"discounts": proposed["discounts"]},
                delta_value={"removed_discounts": removed_discounts},
                confidence=0.8,
                citation=citation,
            )
        )

    if current["payment_terms"] and proposed["payment_terms"] and current["payment_terms"] != proposed["payment_terms"]:
        findings.append(
            CompareQuoteFinding(
                finding_type="payment_terms_changed",
                severity="medium",
                title="Payment terms changed",
                description="The quote changes payment terms from the current contract baseline.",
                current_value=current["payment_terms"],
                proposed_value=proposed["payment_terms"],
                confidence=0.82,
                citation=citation,
            )
        )

    if current["renewal_term"] and proposed["renewal_term"] and current["renewal_term"] != proposed["renewal_term"]:
        findings.append(
            CompareQuoteFinding(
                finding_type="renewal_term_changed",
                severity="medium",
                title="Renewal term changed",
                description="The quote changes the renewal term and should be reviewed before acceptance.",
                current_value=current["renewal_term"],
                proposed_value=proposed["renewal_term"],
                confidence=0.82,
                citation=citation,
            )
        )

    overall_risk = max((finding.severity for finding in findings), key=lambda value: ["info", "low", "medium", "high", "critical"].index(value), default="info")
    warnings = [
        "deterministic_scaffold_no_provider_backed_ai",
        *([] if current_amount is not None else ["current_amount_missing"]),
        *([] if proposed_amount is not None else ["proposed_amount_missing"]),
    ]
    savings = [
        opportunity
        for opportunity in (_savings_from_finding(finding, currency, price_delta) for finding in findings)
        if opportunity
    ]

    return CompareQuoteResponse(
        current_total_amount=current_amount,
        proposed_total_amount=proposed_amount,
        currency=currency,
        price_delta_amount=price_delta,
        price_delta_percent=percent,
        overall_risk_level=overall_risk,
        findings=findings,
        savings_opportunities=savings,
        recommendation_summary="Review quote findings before approving renewal."
        if findings
        else "No deterministic renewal quote risk detected. Keep human review before relying on this evidence.",
        warnings=warnings,
    )
