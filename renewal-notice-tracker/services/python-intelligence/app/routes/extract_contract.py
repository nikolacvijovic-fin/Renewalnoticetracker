from fastapi import APIRouter

from app.models import ExtractContractRequest, ExtractContractResponse

router = APIRouter()


@router.post("/extract-contract", response_model=ExtractContractResponse)
def extract_contract(request: ExtractContractRequest):
    return ExtractContractResponse(
        vendor_name=None,
        renewal_date=None,
        notice_deadline=None,
        auto_renew=None,
        contract_value=None,
        currency=None,
        extracted_fields={"contract_id": request.contract_id, "mode": request.extraction_mode},
        evidence_confidence=0.0,
        citations=[],
        warnings=["deterministic_scaffold_no_ai_provider_called"],
    )
