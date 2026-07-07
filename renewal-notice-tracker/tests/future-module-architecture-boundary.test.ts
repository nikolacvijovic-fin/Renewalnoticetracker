import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_DIRECT_ADMIN_SUPABASE_IMPORTERS,
  PRIVILEGED_ACCESS_POLICY
} from "@/lib/supabase/privileged-access-policy";
import { PLATFORM_CAPABILITIES } from "@/lib/product/platform-orchestration";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function walkSourceFiles(root: string, files: string[] = []) {
  if (!fs.existsSync(root)) return files;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next"].includes(entry.name)) continue;
      walkSourceFiles(fullPath, files);
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizePath(filePath: string) {
  return path.relative(projectRoot, filePath).replaceAll("\\", "/");
}

describe("future module architecture boundary", () => {
  it("keeps contract action exports backward compatible through focused modules", async () => {
    const root = await import("@/lib/actions/contracts");
    const upload = await import("@/lib/actions/contracts/upload");
    const review = await import("@/lib/actions/contracts/review");
    const reminders = await import("@/lib/actions/contracts/reminders");
    const notes = await import("@/lib/actions/contracts/notes");
    const decisions = await import("@/lib/actions/contracts/decisions");
    const counterparties = await import("@/lib/actions/contracts/counterparties");
    const imports = await import("@/lib/actions/contracts/imports");

    expect(root.createContractAction).toBe(upload.createContractAction);
    expect(root.createManualContractAction).toBe(upload.createManualContractAction);
    expect(root.updateContractReviewAction).toBe(review.updateContractReviewAction);
    expect(root.createReminderAction).toBe(reminders.createReminderAction);
    expect(root.createNoteAction).toBe(notes.createNoteAction);
    expect(root.createRenewalDecisionAction).toBe(decisions.createRenewalDecisionAction);
    expect(root.acknowledgeContractAction).toBe(decisions.acknowledgeContractAction);
    expect(root.updateRenewalCycleAction).toBe(decisions.updateRenewalCycleAction);
    expect(root.createCounterpartyAction).toBe(counterparties.createCounterpartyAction);
    expect(root.mergeCounterpartyAction).toBe(counterparties.mergeCounterpartyAction);
    expect(root.importContractsAction).toBe(imports.importContractsAction);
  }, 20000);

  it("keeps moved note and decision implementations out of the legacy contract action shell", () => {
    const legacySource = readProjectFile("lib/actions/contracts/legacy.ts");
    const notesSource = readProjectFile("lib/actions/contracts/notes.ts");
    const decisionsSource = readProjectFile("lib/actions/contracts/decisions.ts");

    for (const movedExport of [
      "export async function createNoteAction",
      "export async function createRenewalDecisionAction",
      "export async function acknowledgeContractAction",
      "export async function updateRenewalCycleAction"
    ]) {
      expect(legacySource).not.toContain(movedExport);
    }

    expect(notesSource).toContain("export async function createNoteAction");
    expect(decisionsSource).toContain("export async function createRenewalDecisionAction");
    expect(decisionsSource).toContain("export async function acknowledgeContractAction");
    expect(decisionsSource).toContain("export async function updateRenewalCycleAction");
  });

  it("blocks new direct service-role imports outside the approved privileged boundary", () => {
    const approved = new Set<string>(APPROVED_DIRECT_ADMIN_SUPABASE_IMPORTERS);
    const directImportPattern = /from\s+["']@\/lib\/supabase\/admin["']/;
    const offenders = walkSourceFiles(path.join(projectRoot, "app"))
      .concat(walkSourceFiles(path.join(projectRoot, "lib")))
      .map((filePath) => ({
        relativePath: normalizePath(filePath),
        source: fs.readFileSync(filePath, "utf8")
      }))
      .filter(({ source }) => directImportPattern.test(source))
      .map(({ relativePath }) => relativePath)
      .filter((relativePath) => !approved.has(relativePath));

    expect(PRIVILEGED_ACCESS_POLICY.futureModulePolicy).toContain("must not import createAdminSupabaseClient directly");
    expect(offenders).toEqual([]);
  });

  it("keeps future modules away from the deprecated contract query surface", () => {
    const futureRoots = [
      path.join(projectRoot, "deferred"),
      path.join(projectRoot, "lib", "product")
    ];
    const deprecatedImportPattern = /from\s+["']@\/lib\/contracts\/queries["']/;
    const offenders = futureRoots
      .flatMap((root) => walkSourceFiles(root))
      .map((filePath) => ({
        relativePath: normalizePath(filePath),
        source: fs.readFileSync(filePath, "utf8")
      }))
      .filter(({ source }) => deprecatedImportPattern.test(source))
      .map(({ relativePath }) => relativePath);

    expect(readProjectFile("lib/contracts/queries.ts")).toContain("Legacy/internal-ops compatibility query surface");
    expect(readProjectFile("lib/contracts/kernel-queries.ts")).toContain("Canonical shipped-kernel contract query surface");
    expect(offenders).toEqual([]);
  });

  it("keeps Revenue Intelligence future-only and isolated from shipped runtime imports", () => {
    const runtimeRoots = [
      path.join(projectRoot, "app"),
      path.join(projectRoot, "components"),
      path.join(projectRoot, "lib")
    ];
    const deferredRevenueImportPattern = /from\s+["']@\/deferred\/revenue-intelligence\//;
    const allowedShim = "lib/product/revenue-intelligence.ts";
    const offenders = runtimeRoots
      .flatMap((root) => walkSourceFiles(root))
      .map((filePath) => ({
        relativePath: normalizePath(filePath),
        source: fs.readFileSync(filePath, "utf8")
      }))
      .filter(({ relativePath, source }) => relativePath !== allowedShim && deferredRevenueImportPattern.test(source))
      .map(({ relativePath }) => relativePath);

    expect(PLATFORM_CAPABILITIES.revenue_intelligence.lifecycle).toBe("future_only");
    expect(readProjectFile("lib/product/revenue-intelligence.ts")).toContain("Compatibility shim only");
    expect(readProjectFile("docs/REVENUE_INTELLIGENCE_RELEASE_GATE.md")).toContain("No runtime Revenue Intelligence module may ship");
    expect(offenders).toEqual([]);
  });
});
