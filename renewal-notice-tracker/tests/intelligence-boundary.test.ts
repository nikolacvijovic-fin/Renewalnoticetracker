import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFinancialIntelligenceInsights } from "@/lib/intelligence/financial/renewal-financial-intelligence";
import { buildProcurementAnalyticsInsights } from "@/lib/intelligence/procurement/renewal-procurement-analytics";
import { buildAiRiskScoringInsights } from "@/lib/intelligence/risk/renewal-risk-scoring";
import type { TrustedWorkflowStateSnapshot } from "@/lib/intelligence/shared/types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const intelligenceRoot = path.join(repoRoot, "lib", "intelligence");

function walkFiles(root: string, files: string[] = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }

    if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

const forbiddenImportPatterns = [
  /from\s+["']@\/lib\/actions\//,
  /from\s+["']@\/lib\/notifications\/reminders/,
  /from\s+["']@\/app\/api\/reminders\//,
  /from\s+["']@\/app\/api\/extract\//,
  /from\s+["']@\/lib\/ocr\/jobs/,
  /import\s+["']@\/lib\/actions\//,
  /import\s+["']@\/lib\/notifications\/reminders/,
  /import\s+["']@\/app\/api\/reminders\//,
  /import\s+["']@\/app\/api\/extract\//,
  /import\s+["']@\/lib\/ocr\/jobs/
];

const forbiddenMutationPatterns = [
  /\.insert\(/,
  /\.update\(/,
  /\.upsert\(/,
  /\.delete\(/,
  /createAdminSupabaseClient/,
  /createServerSupabaseClient/
];

const trustedSnapshot: TrustedWorkflowStateSnapshot = {
  organizationId: "org-1",
  contractId: "contract-1",
  contractTitle: "Master Services Agreement",
  counterpartyName: "Acme Corp",
  noticeDeadlineDate: "2026-07-01",
  renewalDate: "2026-09-01",
  expirationDate: null,
  terminationWindow: "30 days",
  autoRenewal: true,
  reviewCompleted: true,
  ownerAssigned: true,
  trustState: "Verified",
  cycleStatus: "open",
  renewalDecisionStatus: "undecided",
  reminderActivationState: "scheduled",
  contractValue: 120000,
  department: "Procurement"
};

describe("intelligence layer boundary", () => {
  it("does not import reminder or extraction mutation code", () => {
    for (const filePath of walkFiles(intelligenceRoot)) {
      const content = fs.readFileSync(filePath, "utf8");

      for (const pattern of forbiddenImportPatterns) {
        expect(
          content,
          `${path.relative(repoRoot, filePath)} matched forbidden import ${pattern}`
        ).not.toMatch(pattern);
      }
    }
  });

  it("does not write core contract truth", () => {
    for (const filePath of walkFiles(intelligenceRoot)) {
      const content = fs.readFileSync(filePath, "utf8");

      for (const pattern of forbiddenMutationPatterns) {
        expect(
          content,
          `${path.relative(repoRoot, filePath)} matched forbidden mutation ${pattern}`
        ).not.toMatch(pattern);
      }
    }
  });

  it("builds financial, procurement, and risk insights with trust metadata", () => {
    const insights = [
      ...buildFinancialIntelligenceInsights(trustedSnapshot),
      ...buildProcurementAnalyticsInsights(trustedSnapshot),
      ...buildAiRiskScoringInsights(trustedSnapshot)
    ];

    expect(insights.length).toBe(3);

    for (const insight of insights) {
      expect(insight.trustLevel).toBeDefined();
      expect(insight.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(insight.confidenceScore).toBeLessThanOrEqual(1);
      expect(insight.dataQuality).toBeDefined();
      expect(insight.sources.length).toBeGreaterThan(0);
      expect(insight.calculationBasis.usesReviewedTruthOnly).toBe(true);
      expect(insight.calculationBasis.blocksWhenTrustGatesFail).toBe(true);
      expect(Array.isArray(insight.warnings)).toBe(true);
      expect(insight.output).toBeDefined();
    }
  });
});
