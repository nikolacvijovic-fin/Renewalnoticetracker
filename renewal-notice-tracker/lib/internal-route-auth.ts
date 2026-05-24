import { env } from "@/lib/env";
import { createHmac, timingSafeEqual } from "node:crypto";

export const INTERNAL_ROUTE_SECRET_CONFIG = {
  health: {
    envKey: "INTERNAL_HEALTH_SECRET",
    headerName: "x-internal-health-secret"
  },
  ocr_jobs: {
    envKey: "INTERNAL_OCR_JOBS_SECRET",
    headerName: "x-internal-ocr-secret"
  },
  operations: {
    envKey: "INTERNAL_OPERATIONS_SECRET",
    headerName: "x-internal-operations-secret"
  },
  destructive: {
    envKey: "INTERNAL_DESTRUCTIVE_OPS_SECRET",
    headerName: "x-internal-destructive-ops-secret"
  }
} as const;

export type InternalRouteSecretPurpose = keyof typeof INTERNAL_ROUTE_SECRET_CONFIG;
export const INTERNAL_DESTRUCTIVE_TIMESTAMP_HEADER = "x-internal-destructive-timestamp";
export const INTERNAL_DESTRUCTIVE_SIGNATURE_HEADER = "x-internal-destructive-signature";
const INTERNAL_DESTRUCTIVE_MAX_AGE_MS = 5 * 60 * 1000;

export function getInternalRouteSecretHeaderName(purpose: InternalRouteSecretPurpose) {
  return INTERNAL_ROUTE_SECRET_CONFIG[purpose].headerName;
}

export function hasValidInternalRouteSecret(
  request: Request,
  purpose: InternalRouteSecretPurpose
) {
  const config = INTERNAL_ROUTE_SECRET_CONFIG[purpose];
  const providedSecret = request.headers.get(config.headerName);
  const expectedSecret = env[config.envKey];

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
  return createHmac("sha256", env.INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET)
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
