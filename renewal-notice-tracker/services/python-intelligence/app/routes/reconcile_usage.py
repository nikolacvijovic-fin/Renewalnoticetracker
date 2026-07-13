from fastapi import APIRouter

from app.models import ReconcileUsageRequest, ReconcileUsageResponse

router = APIRouter()


@router.post("/reconcile-usage", response_model=ReconcileUsageResponse)
def reconcile_usage(request: ReconcileUsageRequest):
    return ReconcileUsageResponse(
        matched_count=0,
        unmatched_count=0,
        duplicate_candidates=[],
        waste_opportunities=[],
        estimated_savings=0,
    )
