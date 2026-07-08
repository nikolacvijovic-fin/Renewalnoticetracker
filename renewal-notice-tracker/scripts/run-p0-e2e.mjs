import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  redactP0FixtureMessage,
  verifyP0E2EFixtures
} from "./verify-p0-e2e-fixtures.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const requireAuth = args.has("--require-auth");

const baseURL = process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
const cookieName = process.env.E2E_AUTH_COOKIE_NAME ?? "";
const cookieValue = process.env.E2E_AUTH_COOKIE_VALUE ?? "";
const secondaryCookieValue = process.env.E2E_SECONDARY_AUTH_COOKIE_VALUE ?? "";

async function verifyFixturesOrExit() {
  try {
    const fixtureResult = await verifyP0E2EFixtures({ required: requireAuth });
    for (const warning of fixtureResult.warnings) {
      console.warn(warning);
    }
    if (fixtureResult.skipped) {
      process.exit(0);
    }
  } catch (error) {
    console.error(
      redactP0FixtureMessage(
        error instanceof Error ? error.message : "P0 staging fixture verification failed."
      )
    );
    process.exit(1);
  }
}

if (requireAuth) {
  await verifyFixturesOrExit();
}

if (!baseURL) {
  console.warn("Skipping optional P0 browser tests because no E2E base URL is configured.");
  process.exit(0);
}

if (!cookieName || !cookieValue) {
  console.warn("Skipping optional P0 browser tests because auth cookie configuration is missing.");
  process.exit(0);
}

await verifyFixturesOrExit();

const storageStatePath =
  process.env.E2E_STORAGE_STATE_PATH ??
  path.join(os.tmpdir(), `renewal-notice-tracker-p0-${process.pid}.json`);

const buildCookie = (value, name = cookieName) => ({
  name,
  value,
  url: baseURL,
  path: "/",
  httpOnly: true,
  secure: baseURL.startsWith("https://"),
  sameSite: "Lax"
});

const storageState = {
  cookies: [buildCookie(cookieValue)],
  origins: []
};

fs.writeFileSync(storageStatePath, JSON.stringify(storageState, null, 2), "utf8");

const env = {
  ...process.env,
  E2E_REQUIRE_AUTH: requireAuth ? "1" : process.env.E2E_REQUIRE_AUTH ?? "0",
  E2E_STORAGE_STATE_PATH: storageStatePath,
  E2E_AUTH_COOKIE_NAME: cookieName,
  E2E_AUTH_COOKIE_VALUE: cookieValue,
  E2E_SECONDARY_AUTH_COOKIE_VALUE: secondaryCookieValue
};

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  ["playwright", "test", "e2e/p0-release-critical.spec.ts", "--grep", "@p0"],
  {
    stdio: "inherit",
    cwd: path.resolve(scriptDir, ".."),
    env
  }
);

if (!process.env.E2E_STORAGE_STATE_PATH) {
  try {
    fs.unlinkSync(storageStatePath);
  } catch {
    // Best-effort cleanup for temp auth state.
  }
}

process.exit(result.status ?? 1);
