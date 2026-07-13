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
    extraction_mode: Literal["deterministic_scaffold", "provider_backed"]

    @model_validator(mode="after")
    def require_file_reference(self):
        if not self.file_id and not self.file_url:
            raise ValueError("file_id or file_url is required")
        return self


class ExtractContractResponse(BaseModel):
    vendor_name: str | None
    renewal_date: str | None
    notice_deadline: str | None
    auto_renew: bool | None
    contract_value: float | None
    currency: str | None
    extracted_fields: dict[str, Any]
    evidence_confidence: float
    citations: list[str]
    warnings: list[str]


class CompareQuoteRequest(BaseModel):
    organization_id: str = Field(min_length=1)
    contract_id: str = Field(min_length=1)
    current_terms: dict[str, Any]
    proposed_terms: dict[str, Any]


class CompareQuoteResponse(BaseModel):
    price_delta: float
    percent_increase: float
    changed_terms: list[str]
    removed_discounts: list[str]
    negotiation_flags: list[str]
    recommendation: str


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
