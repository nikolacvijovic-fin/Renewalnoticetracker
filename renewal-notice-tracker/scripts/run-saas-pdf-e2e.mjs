import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createSyntheticSaasPdfFixture } from "./synthetic-saas-pdf-fixture.mjs";

const required = process.argv.includes("--required");
let generatedFixtureDirectory = null;
let pdfPath = process.env.E2E_CONTRACT_INTELLIGENCE_PDF_PATH ?? "";

function cleanupGeneratedFixture() {
  if (generatedFixtureDirectory) {
    fs.rmSync(generatedFixtureDirectory, { recursive: true, force: true });
    generatedFixtureDirectory = null;
  }
}

if (!pdfPath && required) {
  generatedFixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "noticecontrol-saas-pdf-e2e-"));
  pdfPath = path.join(generatedFixtureDirectory, "synthetic-saas-renewal.pdf");
  await createSyntheticSaasPdfFixture(pdfPath);
}

const requiredValues = {
  E2E_BASE_URL: process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
  E2E_AUTH_COOKIE_NAME: process.env.E2E_AUTH_COOKIE_NAME ?? "",
  E2E_AUTH_COOKIE_VALUE: process.env.E2E_AUTH_COOKIE_VALUE ?? "",
  E2E_SECONDARY_AUTH_COOKIE_VALUE: process.env.E2E_SECONDARY_AUTH_COOKIE_VALUE ?? "",
  E2E_CONTRACT_INTELLIGENCE_PDF_PATH: pdfPath
};
const missing = Object.entries(requiredValues)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  const message = `SaaS PDF Opt-Out Clock E2E configuration is missing: ${missing.join(", ")}.`;
  if (required) {
    console.error(message);
    cleanupGeneratedFixture();
    process.exit(1);
  }
  console.warn(`${message} Optional browser acceptance was skipped.`);
  cleanupGeneratedFixture();
  process.exit(0);
}

if (!fs.existsSync(requiredValues.E2E_CONTRACT_INTELLIGENCE_PDF_PATH)) {
  console.error("E2E_CONTRACT_INTELLIGENCE_PDF_PATH does not point to a readable synthetic PDF fixture.");
  cleanupGeneratedFixture();
  process.exit(1);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "e2e/saas-pdf-opt-out-clock.spec.ts"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    E2E_REQUIRE_SAAS_PDF_CLOCK: required ? "1" : "0",
    E2E_CONTRACT_INTELLIGENCE_PDF_PATH: pdfPath
  },
  stdio: "inherit"
});

cleanupGeneratedFixture();

process.exit(result.status ?? 1);
