from fastapi import APIRouter
import re

from app.models import ExtractContractCitation, ExtractContractField, ExtractContractRequest, ExtractContractResponse

router = APIRouter()

DATE_PATTERN = re.compile(r"\b(20\d{2}[-/]\d{2}[-/]\d{2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b")
AMOUNT_PATTERN = re.compile(r"\b(USD|EUR|GBP|\$|€|£)\s?([0-9][0-9,]*(?:\.\d{2})?)\b", re.IGNORECASE)
NOTICE_PATTERN = re.compile(r"(?P<days>\d{1,3})\s+days?\s+(?:prior|before|advance notice|notice)", re.IGNORECASE)
AUTO_RENEW_PATTERN = re.compile(r"\b(auto(?:matically)?[- ]renew|auto[- ]renewal|renews automatically)\b", re.IGNORECASE)
PAYMENT_TERMS_PATTERN = re.compile(r"\b(net\s+\d{1,3}|payment\s+terms?[^.]{0,80})", re.IGNORECASE)


def safe_snippet(text: str, start: int, end: int) -> str:
    window_start = max(0, start - 80)
    window_end = min(len(text), end + 80)
    snippet = re.sub(r"\s+", " ", text[window_start:window_end]).strip()
    return snippet[:500]


def citation(request: ExtractContractRequest, text: str, match: re.Match[str]) -> list[ExtractContractCitation]:
    return [
        ExtractContractCitation(
            source_file_id=request.file_id,
            page=1,
            snippet=safe_snippet(text, match.start(), match.end()),
            offsets={"start": match.start(), "end": match.end()},
        )
    ]


def normalized_date(value: str) -> str:
    normalized = value.replace("/", "-")
    parts = normalized.split("-")
    if len(parts) == 3 and len(parts[0]) != 4:
        month, day, year = parts
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return normalized


def add_date_fields(fields: list[ExtractContractField], request: ExtractContractRequest, text: str):
    matches = list(DATE_PATTERN.finditer(text))
    if matches:
        fields.append(
            ExtractContractField(
                field_key="renewal_date",
                extracted_value=matches[0].group(1),
                normalized_value=normalized_date(matches[0].group(1)),
                confidence=0.72,
                citations=citation(request, text, matches[0]),
                warning_codes=["date_role_requires_review"],
            )
        )
    if len(matches) > 1:
        fields.append(
            ExtractContractField(
                field_key="notice_deadline_date",
                extracted_value=matches[1].group(1),
                normalized_value=normalized_date(matches[1].group(1)),
                confidence=0.78,
                citations=citation(request, text, matches[1]),
                warning_codes=[],
            )
        )


def add_notice_window(fields: list[ExtractContractField], request: ExtractContractRequest, text: str):
    match = NOTICE_PATTERN.search(text)
    if not match:
        return
    fields.append(
        ExtractContractField(
            field_key="termination_window",
            extracted_value=match.group(0),
            normalized_value=f"{match.group('days')} days",
            confidence=0.82,
            citations=citation(request, text, match),
            warning_codes=[],
        )
    )


def add_auto_renewal(fields: list[ExtractContractField], request: ExtractContractRequest, text: str):
    match = AUTO_RENEW_PATTERN.search(text)
    if not match:
        return
    fields.append(
        ExtractContractField(
            field_key="auto_renewal",
            extracted_value=True,
            normalized_value=True,
            confidence=0.86,
            citations=citation(request, text, match),
            warning_codes=[],
        )
    )


def add_amount(fields: list[ExtractContractField], request: ExtractContractRequest, text: str):
    match = AMOUNT_PATTERN.search(text)
    if not match:
        return
    currency_symbol = match.group(1).upper()
    currency = {"$": "USD", "€": "EUR", "£": "GBP"}.get(currency_symbol, currency_symbol)
    amount = float(match.group(2).replace(",", ""))
    fields.extend(
        [
            ExtractContractField(
                field_key="contract_value_amount",
                extracted_value=match.group(2),
                normalized_value=amount,
                confidence=0.84,
                citations=citation(request, text, match),
                warning_codes=[],
            ),
            ExtractContractField(
                field_key="contract_value_currency",
                extracted_value=match.group(1),
                normalized_value=currency,
                confidence=0.84,
                citations=citation(request, text, match),
                warning_codes=[],
            ),
        ]
    )


def add_payment_terms(fields: list[ExtractContractField], request: ExtractContractRequest, text: str):
    match = PAYMENT_TERMS_PATTERN.search(text)
    if not match:
        return
    fields.append(
        ExtractContractField(
            field_key="payment_terms",
            extracted_value=match.group(1),
            normalized_value=match.group(1).strip(),
            confidence=0.7,
            citations=citation(request, text, match),
            warning_codes=["payment_terms_requires_review"],
        )
    )


@router.post("/extract-contract", response_model=ExtractContractResponse)
def extract_contract(request: ExtractContractRequest):
    text = request.sample_text or ""
    fields: list[ExtractContractField] = []

    add_date_fields(fields, request, text)
    add_notice_window(fields, request, text)
    add_auto_renewal(fields, request, text)
    add_amount(fields, request, text)
    add_payment_terms(fields, request, text)

    warnings = ["deterministic_scaffold_no_ai_provider_called"]
    if not fields:
        warnings.append("no_supported_fields_detected")
    if any(not field.citations for field in fields):
        warnings.append("field_missing_citation")

    overall_confidence = 0.0
    if fields:
        overall_confidence = round(sum(field.confidence for field in fields) / len(fields), 3)

    return ExtractContractResponse(
        fields=fields,
        overall_confidence=overall_confidence,
        warnings=warnings,
    )
