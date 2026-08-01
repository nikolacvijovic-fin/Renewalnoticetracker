import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSafeSaasRenewalDefenseAuditMetadata,
  calculateNoticeDeadline,
  calculateSaasContractRiskFindings,
  daysUntilOptOut,
  deriveSaasOptOutWorkflowStatus,
  detectSaasContractMetadataConflicts,
  getOptOutDeadlineWindow,
  getOptOutUrgency,
  resolveSaasTrustedField
} from "@/lib/saas/renewal-defense";
import { buildRenewalCommandCenter } from "@/lib/dashboard/renewal-command-center";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("SaaS Renewal Defense runtime slice", () => {
  it("calculates notice deadlines from explicit dates or notice periods", () => {
    expect(
      calculateNoticeDeadline({
        renewalDate: "2026-10-01",
        noticeDeadlineDate: "2026-08-15",
        noticePeriodValue: 30,
        noticePeriodUnit: "days"
      })
    ).toBe("2026-08-15");

    expect(
      calculateNoticeDeadline({
        renewalDate: "2026-10-01",
        noticePeriodValue: 30,
        noticePeriodUnit: "days"
      })
    ).toBe("2026-09-01");

    expect(
      calculateNoticeDeadline({
        expirationDate: "2026-12-15",
        noticePeriodValue: 8,
        noticePeriodUnit: "weeks"
      })
    ).toBe("2026-10-20");

    expect(
      calculateNoticeDeadline({
        renewalDate: "2026-10-01",
        noticePeriodValue: 2,
        noticePeriodUnit: "months"
      })
    ).toBe("2026-08-01");
  });

  it("scores opt-out urgency from the active date boundary", () => {
    expect(daysUntilOptOut("2026-07-06", "2026-07-07")).toBe(-1);
    expect(getOptOutUrgency("2026-07-06", "2026-07-07")).toBe("expired");
    expect(getOptOutUrgency("2026-07-21", "2026-07-07")).toBe("critical");
    expect(getOptOutUrgency("2026-08-01", "2026-07-07")).toBe("high");
    expect(getOptOutUrgency("2026-08-20", "2026-07-07")).toBe("medium");
    expect(getOptOutUrgency("2026-10-01", "2026-07-07")).toBe("low");
    expect(getOptOutDeadlineWindow(null, "2026-07-07")).toBe("missing");
    expect(getOptOutDeadlineWindow("2026-07-06", "2026-07-07")).toBe("expired");
    expect(getOptOutDeadlineWindow("2026-07-14", "2026-07-07")).toBe("due_7_days");
    expect(getOptOutDeadlineWindow("2026-08-01", "2026-07-07")).toBe("due_30_days");
    expect(getOptOutDeadlineWindow("2026-08-20", "2026-07-07")).toBe("due_60_days");
  });

  it("creates opt-out risk findings without outreach behavior", () => {
    expect(
      calculateSaasContractRiskFindings({
        autoRenewal: true,
        renewalDate: null,
        expirationDate: null,
        noticeDeadlineDate: null,
        noticePeriodValue: null,
        noticePeriodUnit: null,
        ownerUserId: null,
        today: "2026-07-07"
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ findingType: "auto_renewal", severity: "medium" }),
        expect.objectContaining({ findingType: "missing_notice_deadline", severity: "high" }),
        expect.objectContaining({ findingType: "missing_owner", severity: "medium" })
      ])
    );

    expect(
      calculateSaasContractRiskFindings({
        autoRenewal: true,
        noticeDeadlineDate: "2026-07-12",
        contractValueAmount: 50000,
        contractValueCurrency: "USD",
        today: "2026-07-07"
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ findingType: "auto_renewal", severity: "critical" }),
        expect.objectContaining({ findingType: "critical_opt_out", severity: "critical" }),
        expect.objectContaining({ findingType: "high_spend_at_risk", severity: "critical" })
      ])
    );
  });

  it("detects contract/SaaS metadata conflicts deterministically", () => {
    const conflicts = detectSaasContractMetadataConflicts({
        saas: {
          renewalDate: "2026-10-01",
          noticeDeadlineDate: "2026-08-01",
          autoRenewal: true,
          contractValueAmount: 42000,
          contractValueCurrency: "USD"
        },
        contractMetadata: {
          renewalDate: "2026-10-01",
          expirationDate: null,
          noticeDeadlineDate: "2026-08-15",
          autoRenewal: false,
          contractValueAmount: 42000,
          contractValueCurrency: "USD"
        }
      });

    expect(conflicts.map((conflict) => conflict.field)).toEqual(["notice_deadline_date", "auto_renewal"]);
    expect(conflicts[0]).toEqual(expect.objectContaining({
      severity: "high",
      recommendedTrustedSource: "contract_metadata",
      recommendationReason: expect.stringContaining("Contract metadata")
    }));
  });

  it("resolves effective trusted values without mutating raw SaaS or contract values", () => {
    const [conflict] = detectSaasContractMetadataConflicts({
      saas: {
        noticeDeadlineDate: "2026-08-01"
      },
      contractMetadata: {
        noticeDeadlineDate: "2026-08-15"
      }
    });
    expect(conflict).toBeDefined();
    if (!conflict) throw new Error("Expected notice deadline conflict");

    expect(resolveSaasTrustedField({ conflict })).toEqual(expect.objectContaining({
      field: "notice_deadline_date",
      effectiveValue: "2026-08-15",
      trustedSource: "contract_metadata",
      resolved: false
    }));
    expect(resolveSaasTrustedField({
      conflict,
      resolution: {
        fieldName: "notice_deadline_date",
        trustedSource: "saas_term",
        resolutionReason: "SaaS import was reviewed against the signed order form."
      }
    })).toEqual(expect.objectContaining({
      effectiveValue: "2026-08-01",
      trustedSource: "saas_term",
      resolved: true
    }));
    expect(resolveSaasTrustedField({
      conflict,
      resolution: {
        fieldName: "notice_deadline_date",
        trustedSource: "manual_override",
        manualOverride: "2026-08-10",
        resolutionReason: "Finance reviewed both sources and selected corrected deadline."
      }
    })).toEqual(expect.objectContaining({
      effectiveValue: "2026-08-10",
      trustedSource: "manual_override",
      resolved: true
    }));
  });

  it("derives owner and next-action workflow status", () => {
    expect(deriveSaasOptOutWorkflowStatus({
      noticeDeadline: null,
      ownerUserId: "user-1",
      openFindingTypes: ["missing_notice_deadline"]
    })).toBe("needs_review");
    expect(deriveSaasOptOutWorkflowStatus({
      noticeDeadline: "2026-08-01",
      ownerUserId: null,
      today: "2026-07-07"
    })).toBe("owner_assigned");
    expect(deriveSaasOptOutWorkflowStatus({
      noticeDeadline: "2026-08-01",
      ownerUserId: "user-1",
      today: "2026-07-07"
    })).toBe("decision_needed");
    expect(deriveSaasOptOutWorkflowStatus({
      noticeDeadline: "2026-12-01",
      ownerUserId: "user-1",
      today: "2026-07-07"
    })).toBe("ready");
  });

  it("adds SaaS opt-out risk into the Renewal Command Center", () => {
    const commandCenter = buildRenewalCommandCenter({
      organizationId: "org-1",
      now: new Date("2026-07-07T00:00:00Z"),
      contracts: [
        {
          id: "contract-1",
          title: "Acme SaaS",
          ownerUserId: "user-1",
          ownerName: "Ava",
          noticeDeadlineDate: "2026-08-01",
          renewalDate: "2026-10-01",
          autoRenewal: true,
          needsReview: false,
          fieldConfidence: { notice_deadline_date: 0.9 },
          contractValueAmount: 50000,
          reminders: [{ status: "pending", remind_at: "2026-07-15" }]
        }
      ],
      saasOptOutItems: [
        {
          contractId: "contract-1",
          deadlineWindow: "due_30_days",
          workflowStatus: "decision_needed",
          ownerUserId: "user-1",
          spendAtRiskAmount: 50000
        }
      ]
    });

    expect(commandCenter.saasOptOutSummary.totalRiskItems).toBe(1);
    expect(commandCenter.saasOptOutSummary.dueIn30DaysCount).toBe(1);
    expect(commandCenter.saasOptOutSummary.spendAtRiskAmount).toBe(50000);
    expect(commandCenter.riskSegments.find((segment) => segment.id === "saas_opt_out_risk")).toMatchObject({
      count: 1,
      targetHref: "/dashboard/saas-opt-out-clock"
    });
  });

  it("builds safe SaaS audit metadata without raw clauses or notes", () => {
    const metadata = buildSafeSaasRenewalDefenseAuditMetadata({
      organizationId: "org-1",
      actorUserId: "user-1",
      contractId: "contract-1",
      saasTermId: "term-1",
      findingId: "finding-1",
      fromStatus: "open",
      toStatus: "accepted_risk",
      deadlineWindow: "due_30_days",
      amount: 50000,
      currency: "USD"
    });

    expect(metadata).toEqual(expect.objectContaining({
      organizationId: "org-1",
      contractId: "contract-1",
      saasTermId: "term-1",
      findingId: "finding-1",
      toStatus: "accepted_risk",
      deadlineWindow: "due_30_days",
      amount: 50000,
      currency: "USD"
    }));
    expect(JSON.stringify(metadata)).not.toMatch(/raw contract|full note|provider payload|secret/i);
  });

  it("keeps SaaS conflict resolution actions scoped, permissioned, audited, and non-mutating", () => {
    const actions = readProjectFile("lib/actions/saas-renewal-defense.ts");

    expect(actions).toContain("resolveSaasMetadataConflictAction");
    expect(actions).toContain("bulkResolveSaasMetadataConflictsWithRecommendedDefaultsAction");
    expect(actions).toContain("reopenSaasMetadataConflictResolutionAction");
    expect(actions).toContain("Only admins, operators, reviewers, or the linked contract owner");
    expect(actions).toContain("context.role === \"owner\" && conflictContext.contract.owner_user_id === context.user.id");
    expect(actions).toContain(".eq(\"organization_id\", context.organizationId)");
    expect(actions).toContain("Manual override requires a resolution reason.");
    expect(actions).toContain("saas.metadata_conflict_resolved");
    expect(actions).toContain("saas.metadata_manual_override_recorded");
    expect(actions).toContain("saas.metadata_conflict_reopened");
    expect(actions).not.toMatch(/from\\(\"contract_metadata\"\\)\\s*\\.update|from\\(\"saas_contract_terms\"\\)\\s*\\.update/);
  });

  it("keeps the new SaaS runtime module scoped and away from the admin service-role client", () => {
    for (const relativePath of [
      "lib/saas/queries.ts",
      "lib/saas/renewal-defense.ts",
      "lib/actions/saas-renewal-defense.ts",
      "app/dashboard/saas-opt-out-clock/page.tsx"
    ]) {
      const source = readProjectFile(relativePath);
      expect(source).not.toContain("@/lib/supabase/admin");
      expect(source).not.toMatch(/Revenue Intelligence|cold outreach|Slack|Teams war room|automatic notice sending/i);
    }

    const queries = readProjectFile("lib/saas/queries.ts");
    expect(queries).toContain('.eq("organization_id", organizationId)');
    expect(queries).toContain('.eq("id", softwareId)');

    const actions = readProjectFile("lib/actions/saas-renewal-defense.ts");
    expect(actions).toContain("requireOrganization()");
    expect(actions).toContain("requireScopedSaasSoftware(payload.softwareId, context.organizationId)");
    expect(actions).toContain("organization_id: context.organizationId");
    expect(actions).toContain(".eq(\"organization_id\", context.organizationId)");
    expect(actions).toContain("createAuditLog");
  });

  it("adds RLS-aware organization-scoped SaaS tables", () => {
    const migration = readProjectFile("supabase/migrations/202607070001_saas_renewal_defense.sql");
    const migrationV15 = readProjectFile("supabase/migrations/202607300003_saas_renewal_defense_v15.sql");
    const conflictMigration = readProjectFile("supabase/migrations/202607300005_saas_metadata_conflict_resolutions.sql");
    for (const table of [
      "saas_software_inventory",
      "saas_contract_terms",
      "saas_opt_out_windows",
      "saas_contract_risk_findings"
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`memberships.organization_id = ${table}.organization_id`);
    }
    expect(migrationV15).toContain("workflow_status text not null default 'needs_review'");
    expect(migrationV15).toContain("next_action text");
    expect(migrationV15).toContain("'accepted_risk'");
    expect(migrationV15).toContain("'contract_saas_metadata_conflict'");
    expect(conflictMigration).toContain("create table if not exists public.saas_contract_metadata_conflict_resolutions");
    expect(conflictMigration).toContain("trusted_source text not null check");
    expect(conflictMigration).toContain("'contract_metadata'");
    expect(conflictMigration).toContain("'saas_term'");
    expect(conflictMigration).toContain("'manual_override'");
    expect(conflictMigration).toContain("char_length(resolution_reason) between 1 and 500");
    expect(conflictMigration).toContain("saas_metadata_conflict_resolution_active_unique_idx");
    expect(conflictMigration).toContain("where reopened_at is null");
    expect(conflictMigration).toContain("alter table public.saas_contract_metadata_conflict_resolutions enable row level security");
    expect(conflictMigration).toContain("memberships.organization_id = saas_contract_metadata_conflict_resolutions.organization_id");
  });
});
