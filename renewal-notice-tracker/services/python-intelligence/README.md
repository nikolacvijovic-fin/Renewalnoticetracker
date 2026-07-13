# Python Intelligence Add-on

Scaffolded FastAPI service for contract extraction, quote comparison, usage reconciliation, and risk scoring.

This service is not a fake AI product. Current endpoint logic is deterministic placeholder behavior so the TypeScript app can depend on stable contracts before provider-backed workflows are implemented.

## Run locally

```bash
pip install -e ".[test]"
uvicorn app.main:app --reload
pytest
```

## Boundary

- Owns document-intelligence workflow contracts.
- Does not own user-facing UI, auth, billing, or organization routing.
- Must not log raw contract text, OCR output, provider payloads, or secrets.
