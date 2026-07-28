import { getAppConfig } from "@/lib/config";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const INTERNAL_ROUTE_SECRET_CONFIG = {
  health: {
    configKey: "healthSecret",
    headerName: "x-internal-health-secret"
  },
  ocr_jobs: {
    configKey: "ocrJobsSecret",
    headerName: "x-internal-ocr-secret"
  },
  operations: {
    configKey: "operationsSecret",
    headerName: "x-internal-operations-secret"
  },
  destructive: {
    configKey: "destructiveOpsSecret",
    headerName: "x-internal-destructive-ops-secret"
  }
} as const;

export type InternalRouteSecretPurpose = keyof typeof INTERNAL_ROUTE_SECRET_CONFIG;
export const INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER = "x-internal-destructive-timestamp";
export const INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER = "x-internal-destructive-signature";
export const INTERNAL_WORKER_TIMESTAMP_HEADER = "x-noticecontrol-timestamp";
export const INTERNAL_WORKER_BODY_SHA256_HEADER = "x-noticecontrol-body-sha256";
export const INTERNAL_WORKER_SIGNATURE_HEADER = "x-noticecontrol-signature";
export const INTERNAL_WORKER_ID_HEADER = "x-noticecontrol-worker-id";
const INTERNAL_DESTRUCTIVE_MAX_AGE_MS = 5 * 60 * 1000;
const INTERNAL_WORKER_MAX_AGE_MS = 5 * 60 * 1000;

export function getInternalRouteSecretHeaderName(purpose: InternalRouteSecretPurpose) {
  return INTERNAL_ROUTE_SECRET_CONFIG[purpose].headerName;
}

export function hasValidInternalRouteSecret(
  request: Request,
  purpose: InternalRouteSecretPurpose
) {
  const config = INTERNAL_ROUTE_SECRET_CONFIG[purpose];
  const providedSecret = request.headers.get(config.headerName);
  const expectedSecret = getAppConfig().internal[config.configKey];

  return Boolean(providedSecret) && providedSecret === expectedSecret;
}

type DestructiveSignatureInput = {
  method: string;
  pathname: string;
  timestamp: string;
  body: string;
};

function buildDestructiveSignaturePayload(input: DestructiveSignatureInput) {
  return [input.method.toUpperCase(), input.pathname, input.timestamp, input.body].join("\n");
}

export function createDestructiveInternalRequestSignature(input: DestructiveSignatureInput) {
  return createHmac("sha256", getAppConfig().internal.destructiveOpsSigningSecret)
    .update(buildDestructiveSignaturePayload(input))
    .digest("hex");
}

export function hasValidDestructiveInternalRequestAuth(
  request: Request,
  body: string,
  now = new Date()
) {
  if (!hasValidInternalRouteSecret(request, "destructive")) {
    return false;
  }

  const timestamp = request.headers.get(INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER);
  const signature = request.headers.get(INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER);

  if (!timestamp || !signature) {
    return false;
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (Math.abs(now.getTime() - timestampMs) > INTERNAL_DESTRUCTIVE_MAX_AGE_MS) {
    return false;
  }

  const url = new URL(request.url);
  const expected = Buffer.from(
    createDestructiveInternalRequestSignature({
      method: request.method,
      pathname: url.pathname,
      timestamp,
      body
    }),
    "hex"
  );
  const provided = Buffer.from(signature, "hex");

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function createWorkerRequestSignature(input: {
  method: string;
  pathname: string;
  timestamp: string;
  bodySha256: string;
  secret: string;
}) {
  const payload = [
    input.method.toUpperCase(),
    input.pathname,
    input.timestamp,
    input.bodySha256
  ].join("\n");
  return `sha256=${createHmac("sha256", input.secret).update(payload).digest("hex")}`;
}

export function createInternalWorkerRequestSignature(input: {
  method: string;
  pathname: string;
  timestamp: string;
  bodySha256: string;
}) {
  const secret = getAppConfig().addOns.internalSigningSecret;
  if (!secret) return null;
  return createWorkerRequestSignature({ ...input, secret });
}

export function hasValidSignedInternalWorkerRequestAuth(
  request: Request,
  body: string,
  now = new Date()
) {
  const secret = getAppConfig().addOns.internalSigningSecret;
  if (!secret) return false;

  const timestamp = request.headers.get(INTERNAL_WORKER_TIMESTAMP_HEADER);
  const bodySha256 = request.headers.get(INTERNAL_WORKER_BODY_SHA256_HEADER);
  const signature = request.headers.get(INTERNAL_WORKER_SIGNATURE_HEADER);
  const workerId = request.headers.get(INTERNAL_WORKER_ID_HEADER);

  if (!timestamp || !bodySha256 || !signature || !workerId?.trim()) {
    return false;
  }

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (Math.abs(now.getTime() - timestampMs) > INTERNAL_WORKER_MAX_AGE_MS) {
    return false;
  }

  const actualBodySha256 = Buffer.from(createHash("sha256").update(body).digest("hex"));
  const providedBodySha256 = Buffer.from(bodySha256);
  if (
    actualBodySha256.length !== providedBodySha256.length ||
    !timingSafeEqual(actualBodySha256, providedBodySha256)
  ) {
    return false;
  }

  const url = new URL(request.url);
  const expected = Buffer.from(
    createWorkerRequestSignature({
      method: request.method,
      pathname: url.pathname,
      timestamp,
      bodySha256,
      secret
    })
  );
  const provided = Buffer.from(signature);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
