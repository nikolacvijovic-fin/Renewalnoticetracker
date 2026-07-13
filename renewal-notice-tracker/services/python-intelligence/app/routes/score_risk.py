from fastapi import APIRouter

from app.models import ScoreRiskRequest, ScoreRiskResponse

router = APIRouter()


@router.post("/score-risk", response_model=ScoreRiskResponse)
def score_risk(request: ScoreRiskRequest):
    factors: list[str] = []
    if request.readiness_context.get("missing_notice_deadline"):
        factors.append("missing_notice_deadline")
    if request.readiness_context.get("auto_renewal"):
        factors.append("auto_renewal")
    score = min(100, len(factors) * 35)
    level = "high" if score >= 70 else "medium" if score >= 35 else "low"
    return ScoreRiskResponse(
        risk_score=score,
        risk_level=level,
        risk_factors=factors,
        recommended_actions=["Complete renewal evidence review"] if factors else ["Keep renewal record current"],
    )
