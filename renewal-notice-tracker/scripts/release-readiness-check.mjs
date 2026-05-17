import {
  getMissingEmailReleaseInputs,
  getMissingP0BrowserInputs,
  getMissingReleaseMetadata,
  getMissingTwoWeekAutonomyChecklist
} from "./phase1-release-gates.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const missing = getMissingReleaseMetadata(process.env);

if (missing.length > 0) {
  console.error(`Missing required release metadata: ${missing.join(", ")}.`);
  process.exit(1);
}

console.log(
  `Release metadata present for ${process.env.RELEASE_TARGET_ENV} (smoke owner: ${process.env.RELEASE_SMOKE_OWNER}, rollback owner: ${process.env.RELEASE_ROLLBACK_OWNER}).`
);

const emailMissing = getMissingEmailReleaseInputs(process.env);
if (emailMissing.length > 0) {
  console.error(`Missing required Phase-1 email-release inputs: ${emailMissing.join(", ")}.`);
  process.exit(1);
}

console.log("Phase-1 email-release inputs are present.");

const p0AuthMissing = getMissingP0BrowserInputs(process.env);

if (p0AuthMissing.length > 0) {
  console.error(
    `Missing required P0 browser-release inputs: ${p0AuthMissing.join(", ")}.`
  );
  process.exit(1);
}

console.log("P0 browser-release inputs are present.");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const autonomyGatePath = path.join(repoRoot, "docs", "TWO_WEEK_AUTONOMY_GATE.md");

if (!fs.existsSync(autonomyGatePath)) {
  console.error("Missing required release gate doc: docs/TWO_WEEK_AUTONOMY_GATE.md.");
  process.exit(1);
}

const autonomyChecklistMissing = getMissingTwoWeekAutonomyChecklist(
  fs.readFileSync(autonomyGatePath, "utf8")
);

if (autonomyChecklistMissing.length > 0) {
  console.error(
    `Two-week autonomy gate is incomplete. Missing: ${autonomyChecklistMissing.join(", ")}.`
  );
  process.exit(1);
}

console.log("Two-week operator autonomy gate is present.");
