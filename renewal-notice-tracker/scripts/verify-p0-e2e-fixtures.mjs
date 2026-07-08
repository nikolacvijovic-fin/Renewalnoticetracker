import path from "node:path";
import { fileURLToPath } from "node:url";

const SENSITIVE_ENV_KEYS = [
  "E2E_AUTH_COOKIE_VALUE",
  "E2E_SECONDARY_AUTH_COOKIE_VALUE",
  "E2E_MEMBER_AUTH_COOKIE_VALUE"
];

const DENIAL_TEXT_PATTERN = /not found|forbidden|unauthorized|access denied|sign in|log in/i;

export class P0FixtureVerificationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "P0FixtureVerificationError";
    this.issues = issues;
  }
}

function trimString(value) {
  return String(value ?? "").trim();
}

function readConfig(env = process.env) {
  return {
    baseURL: trimString(env.E2E_BASE_URL || env.NEXT_PUBLIC_APP_URL),
    cookieName: trimString(env.E2E_AUTH_COOKIE_NAME),
    primaryCookieValue: trimString(env.E2E_AUTH_COOKIE_VALUE),
    secondaryCookieValue: trimString(env.E2E_SECONDARY_AUTH_COOKIE_VALUE),
    memberCookieValue: trimString(env.E2E_MEMBER_AUTH_COOKIE_VALUE),
    reviewContractPath: trimString(env.E2E_REVIEW_CONTRACT_PATH),
    foreignContractPath: trimString(env.E2E_FOREIGN_CONTRACT_PATH)
  };
}

export function redactP0FixtureMessage(message, env = process.env) {
  let redacted = String(message ?? "");
  for (const key of SENSITIVE_ENV_KEYS) {
    const value = trimString(env[key]);
    if (value) {
      redacted = redacted.split(value).join("[REDACTED]");
    }
  }
  return redacted;
}

function cookieHeader(cookieName, cookieValue) {
  return `${cookieName}=${cookieValue}`;
}

function resolveStagingUrl(baseURL, pathOrUrl) {
  const base = new URL(baseURL);
  const target = new URL(pathOrUrl || "/", base);
  if (target.origin !== base.origin) {
    throw new P0FixtureVerificationError(
      `P0 fixture path must stay on the staging origin: ${target.origin}.`,
      ["cross_origin_fixture_path"]
    );
  }
  return target;
}

async function fetchFixture(fetchImpl, url, config, cookieValue) {
  const headers = cookieValue
    ? {
        cookie: cookieHeader(config.cookieName, cookieValue)
      }
    : {};

  return fetchImpl(url, {
    method: "GET",
    headers,
    redirect: "manual"
  });
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}

function isDeniedStatus(status) {
  return status === 401 || status === 403 || status === 404 || isRedirectStatus(status);
}

async function assertReachable(input) {
  const response = await fetchFixture(input.fetchImpl, input.url, input.config, input.cookieValue);
  if (response.status !== 200) {
    throw new P0FixtureVerificationError(`${input.label} is not reachable; received HTTP ${response.status}.`, [
      input.issue
    ]);
  }
  return { name: input.label, status: response.status };
}

async function assertDenied(input) {
  const response = await fetchFixture(input.fetchImpl, input.url, input.config, input.cookieValue);
  if (isDeniedStatus(response.status)) {
    return { name: input.label, status: response.status };
  }

  const body = typeof response.text === "function" ? await response.text() : "";
  if (DENIAL_TEXT_PATTERN.test(body)) {
    return { name: input.label, status: response.status };
  }

  throw new P0FixtureVerificationError(
    `${input.label} did not show a denial response; received HTTP ${response.status}.`,
    [input.issue]
  );
}

function missingRequiredInputs(config, options) {
  const required = [
    [config.baseURL, "E2E_BASE_URL or NEXT_PUBLIC_APP_URL"],
    [config.cookieName, "E2E_AUTH_COOKIE_NAME"],
    [config.primaryCookieValue, "E2E_AUTH_COOKIE_VALUE"],
    [config.reviewContractPath, "E2E_REVIEW_CONTRACT_PATH"],
    [config.foreignContractPath, "E2E_FOREIGN_CONTRACT_PATH"]
  ];

  if (options.requireSecondary) {
    required.push([config.secondaryCookieValue, "E2E_SECONDARY_AUTH_COOKIE_VALUE"]);
  }
  if (options.requireMember) {
    required.push([config.memberCookieValue, "E2E_MEMBER_AUTH_COOKIE_VALUE"]);
  }

  return required.filter(([value]) => !value).map(([, label]) => label);
}

export async function verifyP0E2EFixtures(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const required = Boolean(options.required);
  const requireSecondary = options.requireSecondary ?? required;
  const requireMember = options.requireMember ?? false;
  const config = readConfig(env);
  const warnings = [];
  const checks = [];

  if (typeof fetchImpl !== "function") {
    throw new P0FixtureVerificationError("No fetch implementation is available for P0 fixture verification.", [
      "fetch_unavailable"
    ]);
  }

  const missing = missingRequiredInputs(config, { requireSecondary, requireMember });
  if (missing.length > 0) {
    if (required) {
      throw new P0FixtureVerificationError(
        `Missing required P0 staging fixture inputs: ${missing.join(", ")}.`,
        ["missing_required_inputs"]
      );
    }

    warnings.push(`Skipping P0 fixture verification because inputs are missing: ${missing.join(", ")}.`);
    if (!config.secondaryCookieValue) {
      warnings.push("Secondary auth cookie is not configured; cross-org denial will be skipped in optional mode.");
    }
    if (!config.memberCookieValue) {
      warnings.push("Member auth cookie is not configured; member admin-denial proof will be skipped in optional mode.");
    }
    return { ok: false, skipped: true, warnings, checks };
  }

  let baseUrl;
  let dashboardUrl;
  let reviewUrl;
  let foreignUrl;
  let adminUrl;

  try {
    baseUrl = resolveStagingUrl(config.baseURL, "/");
    dashboardUrl = resolveStagingUrl(config.baseURL, "/dashboard");
    reviewUrl = resolveStagingUrl(config.baseURL, config.reviewContractPath);
    foreignUrl = resolveStagingUrl(config.baseURL, config.foreignContractPath);
    adminUrl = resolveStagingUrl(config.baseURL, "/dashboard/admin");
  } catch (error) {
    if (error instanceof P0FixtureVerificationError) throw error;
    throw new P0FixtureVerificationError("Invalid E2E base URL or fixture path.", ["invalid_url"]);
  }

  try {
    const baseResponse = await fetchFixture(fetchImpl, baseUrl, config, null);
    if (baseResponse.status >= 500) {
      throw new P0FixtureVerificationError(`Staging base URL returned HTTP ${baseResponse.status}.`, [
        "base_url_unreachable"
      ]);
    }
    checks.push({ name: "Staging base URL", status: baseResponse.status });

    checks.push(
      await assertReachable({
        fetchImpl,
        config,
        url: dashboardUrl,
        cookieValue: config.primaryCookieValue,
        label: "Primary dashboard",
        issue: "primary_dashboard_unreachable"
      })
    );

    checks.push(
      await assertReachable({
        fetchImpl,
        config,
        url: reviewUrl,
        cookieValue: config.primaryCookieValue,
        label: "Primary review contract",
        issue: "review_contract_unreachable"
      })
    );

    if (config.secondaryCookieValue) {
      checks.push(
        await assertDenied({
          fetchImpl,
          config,
          url: foreignUrl,
          cookieValue: config.secondaryCookieValue,
          label: "Secondary user cross-org contract denial",
          issue: "cross_org_denial_missing"
        })
      );
    } else {
      warnings.push("Secondary auth cookie is not configured; cross-org denial was not verified.");
    }

    if (config.memberCookieValue) {
      checks.push(
        await assertDenied({
          fetchImpl,
          config,
          url: adminUrl,
          cookieValue: config.memberCookieValue,
          label: "Member admin-surface denial",
          issue: "member_admin_denial_missing"
        })
      );
    } else {
      warnings.push("Member auth cookie is not configured; member admin-denial proof was not verified.");
    }
  } catch (error) {
    if (error instanceof P0FixtureVerificationError) {
      throw new P0FixtureVerificationError(redactP0FixtureMessage(error.message, env), error.issues);
    }
    throw new P0FixtureVerificationError(
      redactP0FixtureMessage(error instanceof Error ? error.message : "P0 fixture verification failed.", env),
      ["verification_failed"]
    );
  }

  return { ok: true, skipped: false, warnings, checks };
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const args = new Set(process.argv.slice(2));
  const required = args.has("--required");
  const requireMember = args.has("--require-member");

  verifyP0E2EFixtures({ required, requireMember })
    .then((result) => {
      for (const warning of result.warnings) {
        console.warn(warning);
      }
      if (result.skipped) {
        process.exit(0);
      }
      console.log(
        `P0 staging fixtures verified: ${result.checks
          .map((check) => `${check.name} (${check.status})`)
          .join(", ")}.`
      );
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "P0 fixture verification failed.";
      console.error(redactP0FixtureMessage(message));
      process.exit(1);
    });
}
