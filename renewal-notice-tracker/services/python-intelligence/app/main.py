from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.routes import compare_quote, extract_contract, health, reconcile_usage, score_risk
from app.security import verify_noticecontrol_signature

app = FastAPI(title="NoticeControl Python Intelligence", version="0.1.0")

app.middleware("http")(lambda request, call_next: _signature_middleware(request, call_next))


async def _signature_middleware(request, call_next):
    try:
        await verify_noticecontrol_signature(request)
    except HTTPException as exception:
        return JSONResponse(
            status_code=exception.status_code,
            content={"detail": exception.detail},
        )
    return await call_next(request)


app.include_router(health.router)
app.include_router(extract_contract.router)
app.include_router(compare_quote.router)
app.include_router(reconcile_usage.router)
app.include_router(score_risk.router)
