from fastapi import FastAPI

from app.routes import compare_quote, extract_contract, health, reconcile_usage, score_risk

app = FastAPI(title="NoticeControl Python Intelligence", version="0.1.0")

app.include_router(health.router)
app.include_router(extract_contract.router)
app.include_router(compare_quote.router)
app.include_router(reconcile_usage.router)
app.include_router(score_risk.router)
