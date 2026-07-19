# Python Intelligence Add-on

Scaffolded FastAPI service for contract extraction, quote comparison, usage reconciliation, and risk scoring.

This service is not a fake AI product. Current endpoint logic is deterministic placeholder behavior so the TypeScript app can depend on stable contracts before provider-backed workflows are implemented.

## What This Teaches

- FastAPI request/response contracts
- deterministic AI-adjacent service design
- privacy-safe document processing boundaries
- signed internal service calls from the TypeScript product shell
- provider adapter design before production AI workflows are enabled

## Product Subsystem

Python owns contract intelligence and document extraction contracts. It is the right runtime for OCR/document parsing, quote comparison, usage reconciliation, and future source-grounded intelligence experiments.

Python does not own UI, billing, entitlements, user sessions, organization routing, or audit truth.

## Run locally

```bash
pip install -e ".[test]"
uvicorn app.main:app --reload
pytest
```

## Learning Tasks

Beginner:

- Run `pytest` and inspect the endpoint contracts.
- Add a deterministic validation test for a request model.

Intermediate:

- Add a new fixture-backed intelligence endpoint.
- Add a provider adapter interface that returns safe structured errors.

Advanced:

- Implement source-grounded extraction with prompt/version tracking.
- Add quote comparison with human-review and evidence QA gates.

## Integration With TypeScript

The Next.js app calls this service only through `lib/add-ons/python-intelligence-client.ts`. Calls must be signed and must not expose raw provider errors to customer-facing routes.

## Scaffolded vs Production-Ready

Current state: scaffolded. Production readiness requires provider-backed extraction, durable job state, source evidence, prompt/version tracking, privacy review, and release-gated entitlement enforcement.

## Boundary

- Owns document-intelligence workflow contracts.
- Does not own user-facing UI, auth, billing, or organization routing.
- Must not log raw contract text, OCR output, provider payloads, or secrets.
