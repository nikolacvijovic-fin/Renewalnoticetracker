import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS } from "@/lib/saas/import-cleanup";

const requireOrganization = vi.fn();
const getOrganizationMembers = vi.fn();
const getSaasOptOutClock = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const revalidatePath = vi.fn();

const inserts: Record<string, unknown[]> = {
  saas_software_inventory: [],
  saas_contract_terms: [],
  saas_opt_out_windows: [],
  saas_contract_risk_findings: []
};

function insertBucket(table: string) {
  if (!inserts[table]) {
    inserts[table] = [];
  }
  return inserts[table];
}

const filePrototype = File.prototype as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> };
if (!filePrototype.arrayBuffer) {
  filePrototype.arrayBuffer = () => Promise.resolve(new ArrayBuffer(0));
}

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getOrganizationMembers
}));

vi.mock("@/lib/saas/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/saas/queries")>("@/lib/saas/queries");
  return {
    ...actual,
    getSaasOptOutClock
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

function csv(rows: string[]) {
  return [SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS.join(","), ...rows].join("\n");
}

function fileFromCsv(rows: string[]) {
  const contents = csv(rows);
  const file = new File([contents], "saas-renewals.csv", { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new TextEncoder().encode(contents).buffer)
  });
  return file;
}

function formDataWith(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

function supabaseMock() {
  return {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        insertBucket(table).push(payload);
        if (table === "saas_contract_risk_findings") {
          return Promise.resolve({ error: null });
        }
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: { id: `${table}-1` },
              error: null
            })
          })
        };
      }
    })
  };
}

describe("SaaS renewal import actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const values of Object.values(inserts)) values.length = 0;
    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
    getOrganizationMembers.mockResolvedValue([
      {
        user_id: "member-1",
        role: "operator",
        user: { id: "member-1", full_name: "Ava Owner", notification_email: "owner@example.com" }
      }
    ]);
    getSaasOptOutClock.mockResolvedValue({
      items: [],
      metrics: {}
    });
    createServerSupabaseClient.mockReturnValue(supabaseMock());
    createAuditLog.mockResolvedValue(undefined);
  });

  it("previews rows with active-organization owner mapping and existing duplicate checks", async () => {
    getSaasOptOutClock.mockResolvedValue({
      items: [
        {
          software: { name: "Acme Cloud", vendor_name: "Acme Inc." },
          latestTerm: { renewal_date: "2026-10-01", notice_deadline_date: "2026-08-15" },
          optOutWindow: { opt_out_deadline: "2026-08-15" }
        }
      ],
      metrics: {}
    });
    const { previewSaasRenewalImportAction } = await import("@/lib/actions/saas-renewal-defense");

    const result = await previewSaasRenewalImportAction(formDataWith(fileFromCsv([
      "Acme Inc.,Acme Cloud,2026-10-01,2026-08-15,,50000,USD,owner@example.com,Finance,Imported source: order form"
    ])));

    expect(getOrganizationMembers).toHaveBeenCalledWith("org-1");
    expect(getSaasOptOutClock).toHaveBeenCalledWith("org-1");
    expect(result.assessment.results[0]).toMatchObject({
      status: "needs_review",
      normalized: {
        ownerUserId: "member-1"
      }
    });
    expect(result.assessment.results[0]?.issues.map((issue) => issue.code)).toContain("duplicate_suspected");
    expect(inserts.saas_software_inventory).toHaveLength(0);
  });

  it("activates only ready rows and preserves organization scope on every insert", async () => {
    const { activateReadySaasRenewalImportRowsAction } = await import("@/lib/actions/saas-renewal-defense");

    const result = await activateReadySaasRenewalImportRowsAction(formDataWith(fileFromCsv([
      "Acme Inc.,Acme Cloud,2026-10-01,2026-08-15,,50000,USD,owner@example.com,Finance,Imported source: order form",
      "Beta Ltd,Beta Suite,2026-11-01,,,,12000,EUR,missing@example.com,Ops,Manual spreadsheet only"
    ])));

    expect(result).toMatchObject({
      activatedCount: 1,
      blockedCount: 1
    });
    expect(inserts.saas_software_inventory).toHaveLength(1);
    expect(inserts.saas_contract_terms).toHaveLength(1);
    expect(inserts.saas_opt_out_windows).toHaveLength(1);
    expect(insertBucket("saas_software_inventory")[0]).toEqual(expect.objectContaining({
      organization_id: "org-1",
      name: "Acme Cloud",
      owner_user_id: "member-1"
    }));
    expect(insertBucket("saas_contract_terms")[0]).toEqual(expect.objectContaining({
      organization_id: "org-1",
      notice_deadline_date: "2026-08-15",
      contract_value_amount: 50000
    }));
    expect(insertBucket("saas_opt_out_windows")[0]).toEqual(expect.objectContaining({
      organization_id: "org-1",
      opt_out_deadline: "2026-08-15",
      workflow_status: "ready"
    }));
    expect(JSON.stringify(inserts)).not.toContain("Beta Suite");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/saas-opt-out-clock");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("blocks non-admin/operator imports before parsing payloads into records", async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "viewer@example.com" },
      organizationId: "org-1",
      role: "reviewer"
    });
    const { activateReadySaasRenewalImportRowsAction } = await import("@/lib/actions/saas-renewal-defense");

    await expect(
      activateReadySaasRenewalImportRowsAction(formDataWith(fileFromCsv([
        "Acme Inc.,Acme Cloud,2026-10-01,2026-08-15,,50000,USD,owner@example.com,Finance,Imported source: order form"
      ])))
    ).rejects.toThrow("Only admins and operators");

    expect(getOrganizationMembers).not.toHaveBeenCalled();
    expect(inserts.saas_software_inventory).toHaveLength(0);
  });
});
