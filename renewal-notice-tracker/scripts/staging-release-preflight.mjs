import { getBackgroundJobConfigIssues } from "./deployment-readiness-gates.mjs";

const groups = {
  metadata: ["RELEASE_TARGET_ENV", "RELEASE_SMOKE_OWNER", "RELEASE_ROLLBACK_OWNER"],
  supabase: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_STORAGE_BUCKET",
    "SUPABASE_EXPORTS_BUCKET"
  ],
  email: [
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "NOTICECONTROL_SENDING_DOMAIN",
    "NOTICECONTROL_REPLY_TO_EMAIL",
    "RESEND_WEBHOOK_SIGNING_SECRET",
    "NOTICECONTROL_EMAIL_ACTION_SECRET"
  ],
  billing: [
    "PADDLE_ENVIRONMENT",
    "PADDLE_API_KEY",
    "PADDLE_WEBHOOK_SECRET",
    "PADDLE_STARTER_PRICE_ID",
    "PADDLE_GROWTH_PRICE_ID"
  ],
  internal: [
    "CRON_SHARED_SECRET",
    "ADD_ON_INTERNAL_SIGNING_SECRET",
    "INTERNAL_HEALTH_SECRET",
    "INTERNAL_OCR_JOBS_SECRET",
    "INTERNAL_OPERATIONS_SECRET",
    "INTERNAL_DESTRUCTIVE_OPS_SECRET",
    "INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET"
  ],
  e2e: [
    "E2E_BASE_URL",
    "E2E_AUTH_COOKIE_NAME",
    "E2E_AUTH_COOKIE_VALUE",
    "E2E_SECONDARY_AUTH_COOKIE_VALUE",
    "E2E_REVIEW_CONTRACT_PATH",
    "E2E_FOREIGN_CONTRACT_PATH"
  ]
};

function missing(env, keys) {
  return keys.filter((key) => !String(env[key] ?? "").trim());
}

function invalidStagingUrl(env) {
  const value = env.E2E_BASE_URL ?? env.NEXT_PUBLIC_APP_URL;
  if (!value) return [];
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname) ||
      url.hostname.endsWith(".local")
    ) {
      return ["E2E_BASE_URL"];
    }
  } catch {
    return ["E2E_BASE_URL"];
  }
  return [];
}

export function getStagingReleasePreflightIssues(env = process.env) {
  const missingByGroup = Object.fromEntries(
    Object.entries(groups).map(([group, keys]) => [group, missing(env, keys)])
  );
  const target = String(env.RELEASE_TARGET_ENV ?? "").trim().toLowerCase();
  if (target && target !== "staging") {
    missingByGroup.metadata = [...new Set([...missingByGroup.metadata, "RELEASE_TARGET_ENV"])];
  }

  const ocr = [];
  if (!String(env.OCR_PROVIDER ?? "").trim()) ocr.push("OCR_PROVIDER");
  if (String(env.OCR_PROVIDER ?? "").trim().toLowerCase() === "openai") {
    ocr.push(...missing(env, ["OPENAI_API_KEY", "OCR_OPENAI_API_KEY", "OCR_OPENAI_MODEL"]));
  }
  missingByGroup.ocr = ocr;

  const operationLimits = getBackgroundJobConfigIssues(env).map((issue) => issue.details.key);
  const invalidUrls = invalidStagingUrl(env);

  return { missingByGroup, operationLimits, invalidUrls };
}

export function hasStagingReleasePreflightFailures(result) {
  return (
    Object.values(result.missingByGroup).some((keys) => keys.length > 0) ||
    result.operationLimits.length > 0 ||
    result.invalidUrls.length > 0
  );
}

export function printStagingReleasePreflight(result, write = console.error) {
  for (const [group, keys] of Object.entries(result.missingByGroup)) {
    if (keys.length) write(`Missing ${group} configuration: ${keys.join(", ")}`);
  }
  if (result.operationLimits.length) write(`Invalid runtime limits: ${result.operationLimits.join(", ")}`);
  if (result.invalidUrls.length) write(`Invalid staging URL: ${result.invalidUrls.join(", ")}`);
}

if (process.argv[1]?.endsWith("staging-release-preflight.mjs")) {
  const result = getStagingReleasePreflightIssues();
  if (hasStagingReleasePreflightFailures(result)) {
    printStagingReleasePreflight(result);
    process.exitCode = 1;
  } else {
    console.log("Staging release preflight passed.");
  }
}
