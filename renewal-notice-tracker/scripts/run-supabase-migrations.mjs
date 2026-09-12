import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMigrationSafetyIssues } from "./deployment-readiness-gates.mjs";

const mode = process.argv.includes("--apply") ? "apply" : "plan";
const verifyReviewedPlan = process.argv.includes("--verify-reviewed-plan");
const targetEnvironment = String(process.env.RELEASE_TARGET_ENV ?? "").trim().toLowerCase();
const databaseUrl = String(process.env.SUPABASE_DB_URL ?? "").trim();

export function getMigrationPlanFingerprint(repoRoot) {
  const migrationDirectory = path.join(repoRoot, "supabase", "migrations");
  const migrations = fs.readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const fingerprint = createHash("sha256");
  for (const migration of migrations) {
    fingerprint.update(migration);
    fingerprint.update("\n");
    fingerprint.update(fs.readFileSync(path.join(migrationDirectory, migration)));
    fingerprint.update("\n");
  }
  return fingerprint.digest("hex");
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationIssues = getMigrationSafetyIssues(repoRoot);
if (migrationIssues.length > 0) {
  console.error(`Migration safety checks failed: ${migrationIssues.map((issue) => issue.code).join(", ")}.`);
  process.exit(1);
}

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is required for migration rollout.");
  process.exit(1);
}
if (!["staging", "production"].includes(targetEnvironment)) {
  console.error("RELEASE_TARGET_ENV must be staging or production for migration rollout.");
  process.exit(1);
}

const migrationPlanFingerprint = getMigrationPlanFingerprint(repoRoot);
const reviewedPlanFingerprint = String(process.env.MIGRATION_PLAN_REVIEW_SHA256 ?? "").trim();
if ((verifyReviewedPlan || mode === "apply") && reviewedPlanFingerprint !== migrationPlanFingerprint) {
  console.error("MIGRATION_PLAN_REVIEW_SHA256 must match the current forward-only migration plan before release or apply.");
  process.exit(1);
}
if (mode === "apply" && process.env.CONFIRM_DATABASE_MIGRATION_ROLLOUT !== targetEnvironment) {
  console.error("CONFIRM_DATABASE_MIGRATION_ROLLOUT must exactly match RELEASE_TARGET_ENV before applying migrations.");
  process.exit(1);
}

if (verifyReviewedPlan) {
  console.log(`Reviewed ${targetEnvironment} migration plan fingerprint is current: ${migrationPlanFingerprint}.`);
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["--yes", "supabase@2.39.2", "db", "push", "--db-url", databaseUrl, "--include-all"];
if (mode === "plan") args.push("--dry-run");
if (mode === "apply") args.push("--yes");

console.log(`${mode === "apply" ? "Applying" : "Planning"} ${targetEnvironment} Supabase migrations.`);
console.log(`Migration plan fingerprint: ${migrationPlanFingerprint}.`);
const result = spawnSync(command, args, {
  cwd: new URL("..", import.meta.url),
  env: process.env,
  stdio: "inherit"
});
process.exit(result.status ?? 1);
