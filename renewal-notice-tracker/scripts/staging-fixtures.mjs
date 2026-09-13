import path from "node:path";
import { createSyntheticSaasPdfFixture } from "./synthetic-saas-pdf-fixture.mjs";

const confirmation = "--confirm-staging-fixtures";

function assertStaging(env) {
  if (String(env.RELEASE_TARGET_ENV ?? "").trim().toLowerCase() !== "staging") {
    throw new Error("Staging fixture preparation requires RELEASE_TARGET_ENV=staging.");
  }
}

export function getStagingFixturePath(env = process.env) {
  return env.E2E_CONTRACT_INTELLIGENCE_PDF_PATH
    ? path.resolve(env.E2E_CONTRACT_INTELLIGENCE_PDF_PATH)
    : path.resolve(".staging-fixtures", "noticecontrol-synthetic-saas-renewal.pdf");
}

export async function prepareStagingFixtures({ env = process.env, confirmed = false } = {}) {
  assertStaging(env);
  if (!confirmed) throw new Error(`Refusing fixture mutation without ${confirmation}.`);
  const pdfPath = getStagingFixturePath(env);
  await createSyntheticSaasPdfFixture(pdfPath);
  return { pdfPath };
}

if (process.argv[1]?.endsWith("staging-fixtures.mjs")) {
  try {
    const result = await prepareStagingFixtures({ confirmed: process.argv.includes(confirmation) });
    console.log(`E2E_CONTRACT_INTELLIGENCE_PDF_PATH=${result.pdfPath}`);
    console.log("Auth users, cookies, and seeded review/foreign contracts remain documented manual staging prerequisites.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging fixture preparation failed.");
    process.exitCode = 1;
  }
}
