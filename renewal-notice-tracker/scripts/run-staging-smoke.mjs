import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const required = [
  ["RELEASE_TARGET_ENV", "target environment"],
  ["RELEASE_SMOKE_OWNER", "smoke-check owner"],
  ["RELEASE_ROLLBACK_OWNER", "rollback owner"],
  ["E2E_BASE_URL", "staging base URL"],
  ["E2E_AUTH_COOKIE_NAME", "primary auth cookie name"],
  ["E2E_AUTH_COOKIE_VALUE", "primary auth cookie value"],
  ["E2E_SECONDARY_AUTH_COOKIE_VALUE", "secondary auth cookie value for cross-org denial"]
];

const missing = required.filter(([key]) => !process.env[key]).map(([, label]) => label);
if (missing.length > 0) {
  console.error(`Missing required staging smoke inputs: ${missing.join(", ")}.`);
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const command = process.platform === "win32" ? "node.exe" : "node";
const result = spawnSync(command, [path.join(scriptDir, "run-p0-e2e.mjs"), "--require-auth"], {
  stdio: "inherit",
  cwd: path.resolve(scriptDir, ".."),
  env: process.env
});

process.exit(result.status ?? 1);
