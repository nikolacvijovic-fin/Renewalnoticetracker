import fs from "node:fs";
import { spawnSync } from "node:child_process";

const required = process.argv.includes("--required");
const requiredValues = {
  E2E_BASE_URL: process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
  E2E_AUTH_COOKIE_NAME: process.env.E2E_AUTH_COOKIE_NAME ?? "",
  E2E_AUTH_COOKIE_VALUE: process.env.E2E_AUTH_COOKIE_VALUE ?? "",
  E2E_CONTRACT_INTELLIGENCE_PDF_PATH: process.env.E2E_CONTRACT_INTELLIGENCE_PDF_PATH ?? ""
};
const missing = Object.entries(requiredValues)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  const message = `Contract-intelligence E2E configuration is missing: ${missing.join(", ")}.`;
  if (required) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message} Optional browser acceptance was skipped.`);
  process.exit(0);
}

if (!fs.existsSync(requiredValues.E2E_CONTRACT_INTELLIGENCE_PDF_PATH)) {
  console.error("E2E_CONTRACT_INTELLIGENCE_PDF_PATH does not point to a readable synthetic PDF fixture.");
  process.exit(1);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "e2e/full-document-contract-intelligence.spec.ts"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    E2E_REQUIRE_CONTRACT_INTELLIGENCE: required ? "1" : "0"
  },
  stdio: "inherit"
});

process.exit(result.status ?? 1);
