from fastapi import APIRouter

from app.models import CompareQuoteRequest, CompareQuoteResponse

router = APIRouter()


@router.post("/compare-quote", response_model=CompareQuoteResponse)
def compare_quote(request: CompareQuoteRequest):
    current_price = float(request.current_terms.get("price", 0) or 0)
    proposed_price = float(request.proposed_terms.get("price", 0) or 0)
    price_delta = proposed_price - current_price
    percent_increase = (price_delta / current_price * 100) if current_price > 0 else 0
    return CompareQuoteResponse(
        price_delta=price_delta,
        percent_increase=round(percent_increase, 2),
        changed_terms=[],
        removed_discounts=[],
        negotiation_flags=["price_increase"] if price_delta > 0 else [],
        recommendation="Review manually before negotiation." if price_delta > 0 else "No deterministic price increase detected.",
    )
