from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class HealthResponse(BaseModel):
    service: str = "python-intelligence"
    version: str = "0.1.0"
    status: Literal["ok", "degraded", "unavailable"] = "ok"


class ExtractContractRequest(BaseModel):
    organization_id: str = Field(min_length=1)
    contract_id: str = Field(min_length=1)
    file_id: str | None = None
    file_url: str | None = None
    sample_text: str | None = None
    extraction_mode: Literal["deterministic_scaffold", "provider_backed"]

    @model_validator(mode="after")
    def require_file_reference(self):
        if not self.file_id and not self.file_url and not self.sample_text:
            raise ValueError("file_id, file_url, or sample_text is required")
        return self


class ExtractContractCitation(BaseModel):
    source_file_id: str | None = None
    page: int | None = None
    snippet: str | None = None
    offsets: dict[str, Any] | None = None


class ExtractContractField(BaseModel):
    field_key: Literal[
        "vendor_name",
        "renewal_date",
        "notice_deadline_date",
        "auto_renewal",
        "contract_value_amount",
        "contract_value_currency",
        "renewal_term",
        "termination_window",
        "price_change_trigger",
        "payment_terms",
    ]
    extracted_value: Any
    normalized_value: Any | None = None
    confidence: float = Field(ge=0, le=1)
    citations: list[ExtractContractCitation] = Field(default_factory=list)
    warning_codes: list[str] = Field(default_factory=list)


class ExtractContractResponse(BaseModel):
    extraction_run_id: str | None = None
    fields: list[ExtractContractField]
    overall_confidence: float = Field(ge=0, le=1)
    warnings: list[str]


class CompareQuoteRequest(BaseModel):
    organization_id: str = Field(min_length=1)
    contract_id: str = Field(min_length=1)
    current_terms: dict[str, Any]
    proposed_terms: dict[str, Any]
    quote_text: str | None = None
    comparison_mode: Literal["deterministic_scaffold", "provider_backed"] = "deterministic_scaffold"


class CompareQuoteCitation(BaseModel):
    source_file_id: str | None = None
    page: int | None = None
    snippet: str | None = None
    evidence_label: str | None = None


class CompareQuoteFinding(BaseModel):
    finding_type: Literal[
        "price_increase",
        "discount_removed",
        "sku_changed",
        "payment_terms_changed",
        "renewal_term_changed",
        "auto_renew_risk",
        "notice_window_risk",
        "usage_mismatch",
        "duplicate_vendor_risk",
        "unfavorable_clause_change",
    ]
    severity: Literal["info", "low", "medium", "high", "critical"]
    title: str
    description: str
    current_value: Any | None = None
    proposed_value: Any | None = None
    delta_value: Any | None = None
    confidence: float = Field(ge=0, le=1)
    citation: CompareQuoteCitation | None = None


class CompareQuoteSavingsOpportunity(BaseModel):
    opportunity_type: str
    title: str
    estimated_savings_amount: float | None = None
    currency: str | None = None
    confidence: float = Field(ge=0, le=1)
    evidence: dict[str, Any]


class CompareQuoteResponse(BaseModel):
    current_total_amount: float | None = None
    proposed_total_amount: float | None = None
    currency: str | None = None
    price_delta_amount: float | None = None
    price_delta_percent: float | None = None
    overall_risk_level: Literal["unknown", "info", "low", "medium", "high", "critical"]
    findings: list[CompareQuoteFinding]
    savings_opportunities: list[CompareQuoteSavingsOpportunity]
    recommendation_summary: str
    warnings: list[str]


class ReconcileUsageRequest(BaseModel):
    organization_id: str = Field(min_length=1)
    usage_import_batch_id: str = Field(min_length=1)
    matching_mode: Literal["strict", "balanced", "exploratory"]


class ReconcileUsageResponse(BaseModel):
    matched_count: int
    unmatched_count: int
    duplicate_candidates: list[str]
    waste_opportunities: list[str]
    estimated_savings: float


class ScoreRiskRequest(BaseModel):
    organization_id: str = Field(min_length=1)
    contract_id: str = Field(min_length=1)
    readiness_context: dict[str, Any]


class ScoreRiskResponse(BaseModel):
    risk_score: int
    risk_level: Literal["low", "medium", "high", "critical"]
    risk_factors: list[str]
    recommended_actions: list[str]
