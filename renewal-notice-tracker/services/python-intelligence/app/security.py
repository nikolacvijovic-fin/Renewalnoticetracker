import hashlib
import hmac
import os
import time
from datetime import datetime, timezone

from fastapi import HTTPException, Request

MAX_SKEW_SECONDS = 300


def _parse_timestamp(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="invalid_signature_timestamp") from exc


async def verify_noticecontrol_signature(request: Request) -> None:
    if request.method == "GET" and request.url.path == "/health":
        return

    secret = os.getenv("ADD_ON_INTERNAL_SIGNING_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="signature_secret_not_configured")

    timestamp = request.headers.get("x-noticecontrol-timestamp")
    body_hash = request.headers.get("x-noticecontrol-body-sha256")
    signature = request.headers.get("x-noticecontrol-signature")

    if not timestamp or not body_hash or not signature:
        raise HTTPException(status_code=401, detail="missing_signature_headers")

    if abs(time.time() - _parse_timestamp(timestamp)) > MAX_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="expired_signature_timestamp")

    body = await request.body()
    expected_body_hash = hashlib.sha256(body).hexdigest()
    if not hmac.compare_digest(expected_body_hash, body_hash):
        raise HTTPException(status_code=401, detail="body_hash_mismatch")

    path = request.url.path
    if request.url.query:
        path = f"{path}?{request.url.query}"
    payload = "\n".join([request.method.upper(), path, timestamp, body_hash])
    expected_signature = "sha256=" + hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=401, detail="invalid_signature")
