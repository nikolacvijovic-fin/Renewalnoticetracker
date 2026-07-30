import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAAS_RENEWAL_IMPORT_TEMPLATE_HEADERS } from "@/lib/saas/import-cleanup";

const requireOrganization = vi.fn();
const getOrganizationMembers = vi.fn();
const getSaasOptOutClock = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const revalidatePath = vi.fn();
const ROW_REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const ROW_WEAK_ID = "22222222-2222-4222-8222-222222222222";
const ROW_READY_ID = "33333333-3333-4333-8333-333333333333";
const ROW_REJECT_ID = "44444444-4444-4444-8444-444444444444";
const ROW_DUPLICATE_ID = "55555555-5555-4555-8555-555555555555";

const inserts: Record<string, unknown[]> = {
  saas_renewal_import_batches: [],
  saas_renewal_import_rows: [],
  saas_software_inventory: [],
  saas_contract_terms: [],
  saas_opt_out_windows: [],
  saas_contract_risk_findings: []
};
const updates: Record<string, unknown[]> = {};
let storedImportRows: Array<Record<string, unknown>> = [];

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
        if (table === "saas_renewal_import_rows") {
          const rows = Array.isArray(payload) ? payload : [payload];
          storedImportRows.push(...rows.map((row, index) => ({
            ...(row as Record<string, unknown>),
            id: `import-row-${storedImportRows.length + index + 1}`
          })));
          return Promise.resolve({ error: null });
        }
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
      },
      select: () => ({
        eq: (field: string, value: unknown) => {
          const filters: Record<string, unknown> = { [field]: value };
          return {
            eq: (nextField: string, nextValue: unknown) => {
              filters[nextField] = nextValue;
              return {
                maybeSingle: () => Promise.resolve({
                  data: storedImportRows.find((row) =>
                    Object.entries(filters).every(([key, filterValue]) => row[key] === filterValue)
                  ) ?? null,
                  error: null
                })
              };
            }
          };
        }
      }),
      update: (payload: unknown) => ({
        eq: (field: string, value: unknown) => ({
          eq: (nextField: string, nextValue: unknown) => {
            updates[table] = [...(updates[table] ?? []), payload];
            storedImportRows = storedImportRows.map((row) =>
              row[field] === value && row[nextField] === nextValue
                ? { ...row, ...(payload as Record<string, unknown>) }
                : row
            );
            return Promise.resolve({ error: null });
          }
        })
      })
    })
  };
}

describe("SaaS renewal import actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const values of Object.values(inserts)) values.length = 0;
    for (const key of Object.keys(updates)) updates[key] = [];
    storedImportRows = [];
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
    expect(result.batchId).toBe("saas_renewal_import_batches-1");
    expect(insertBucket("saas_renewal_import_batches")[0]).toEqual(expect.objectContaining({
      organization_id: "org-1",
      uploaded_by_user_id: "user-1",
      status: "needs_review",
      row_count: 1
    }));
    expect(insertBucket("saas_renewal_import_rows")).toHaveLength(1);
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

  it("corrects a review row into ready status without activating it automatically", async () => {
    storedImportRows = [
      {
        id: ROW_REVIEW_ID,
        organization_id: "org-1",
        batch_id: "batch-1",
        row_number: 2,
        status: "needs_review",
        accepted_weak_evidence: false,
        duplicate_confirmed: false,
        raw_row_json: {
          vendor_name: "Acme Inc.",
          product_name: "Acme Cloud",
          renewal_date: "01/02/2026",
          notice_deadline_date: "",
          notice_period: "",
          contract_value_amount: "50000",
          contract_value_currency: "USD",
          owner_email: "missing@example.com",
          department_category: "Finance",
          source_notes: "Imported source: order form"
        }
      }
    ];
    const { correctSaasRenewalImportRowAction } = await import("@/lib/actions/saas-renewal-defense");
    const formData = new FormData();
    formData.set("row_id", ROW_REVIEW_ID);
    formData.set("vendor_name", "Acme Inc.");
    formData.set("product_name", "Acme Cloud");
    formData.set("renewal_date", "");
    formData.set("notice_deadline_date", "2026-08-15");
    formData.set("notice_period", "");
    formData.set("contract_value_amount", "50000");
    formData.set("contract_value_currency", "USD");
    formData.set("owner_email", "owner@example.com");
    formData.set("department_category", "Finance");
    formData.set("source_notes", "Imported source: order form");
    formData.set("review_notes", "Corrected owner and deadline from reviewed import.");

    await correctSaasRenewalImportRowAction(formData);

    expect(updates.saas_renewal_import_rows?.at(-1)).toEqual(expect.objectContaining({
      status: "corrected",
      review_notes: "Corrected owner and deadline from reviewed import.",
      reviewed_by_user_id: "user-1",
      raw_row_json: expect.objectContaining({
        renewal_date: "",
        notice_deadline_date: "2026-08-15",
        owner_email: "owner@example.com"
      })
    }));
    expect(inserts.saas_software_inventory).toHaveLength(0);
  });

  it("requires explicit weak evidence acceptance before a manual-only row becomes ready", async () => {
    storedImportRows = [
      {
        id: ROW_WEAK_ID,
        organization_id: "org-1",
        batch_id: "batch-1",
        row_number: 2,
        status: "needs_review",
        accepted_weak_evidence: false,
        duplicate_confirmed: false,
        raw_row_json: {
          vendor_name: "Acme Inc.",
          product_name: "Acme Cloud",
          renewal_date: "2026-10-01",
          notice_deadline_date: "2026-08-15",
          notice_period: "",
          contract_value_amount: "50000",
          contract_value_currency: "USD",
          owner_email: "owner@example.com",
          department_category: "Finance",
          source_notes: "Manual spreadsheet only"
        }
      }
    ];
    const { acceptSaasRenewalImportWeakEvidenceAction } = await import("@/lib/actions/saas-renewal-defense");
    const formData = new FormData();
    formData.set("row_id", ROW_WEAK_ID);
    formData.set("review_notes", "Manual spreadsheet reviewed and accepted for import activation.");

    await acceptSaasRenewalImportWeakEvidenceAction(formData);

    expect(updates.saas_renewal_import_rows?.at(-1)).toEqual(expect.objectContaining({
      status: "corrected",
      accepted_weak_evidence: true,
      review_notes: "Manual spreadsheet reviewed and accepted for import activation.",
      issues_json: []
    }));
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toMatch(/Manual spreadsheet only|Acme Cloud/);
  });

  it("requires duplicate confirmation before a duplicate-suspected row becomes corrected", async () => {
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
    storedImportRows = [
      {
        id: ROW_DUPLICATE_ID,
        organization_id: "org-1",
        batch_id: "batch-1",
        row_number: 2,
        status: "needs_review",
        accepted_weak_evidence: false,
        duplicate_confirmed: false,
        raw_row_json: {
          vendor_name: "Acme Inc.",
          product_name: "Acme Cloud",
          renewal_date: "2026-10-01",
          notice_deadline_date: "2026-08-15",
          notice_period: "",
          contract_value_amount: "50000",
          contract_value_currency: "USD",
          owner_email: "owner@example.com",
          department_category: "Finance",
          source_notes: "Imported source: order form"
        }
      }
    ];
    const { confirmSaasRenewalImportDuplicateAction } = await import("@/lib/actions/saas-renewal-defense");
    const formData = new FormData();
    formData.set("row_id", ROW_DUPLICATE_ID);
    formData.set("review_notes", "Duplicate reviewed and intentionally retained.");

    await confirmSaasRenewalImportDuplicateAction(formData);

    expect(updates.saas_renewal_import_rows?.at(-1)).toEqual(expect.objectContaining({
      status: "corrected",
      duplicate_confirmed: true,
      review_notes: "Duplicate reviewed and intentionally retained.",
      issues_json: []
    }));
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "saas.import_row_duplicate_confirmed",
        details: expect.objectContaining({
          importBatchId: "batch-1",
          importRowId: ROW_DUPLICATE_ID,
          rowNumber: 2
        })
      }),
      expect.anything()
    );
  });

  it("activates a persisted ready review row and audits safe metadata", async () => {
    storedImportRows = [
      {
        id: ROW_READY_ID,
        organization_id: "org-1",
        batch_id: "batch-1",
        row_number: 2,
        status: "ready",
        accepted_weak_evidence: false,
        duplicate_confirmed: false,
        raw_row_json: {
          vendor_name: "Acme Inc.",
          product_name: "Acme Cloud",
          renewal_date: "2026-10-01",
          notice_deadline_date: "2026-08-15",
          notice_period: "",
          contract_value_amount: "50000",
          contract_value_currency: "USD",
          owner_email: "owner@example.com",
          department_category: "Finance",
          source_notes: "Imported source: order form"
        }
      }
    ];
    const { activateSaasRenewalImportRowAction } = await import("@/lib/actions/saas-renewal-defense");
    const formData = new FormData();
    formData.set("row_id", ROW_READY_ID);

    await activateSaasRenewalImportRowAction(formData);

    expect(inserts.saas_software_inventory).toHaveLength(1);
    expect(insertBucket("saas_software_inventory")[0]).toEqual(expect.objectContaining({
      organization_id: "org-1",
      name: "Acme Cloud"
    }));
    expect(updates.saas_renewal_import_rows?.at(-1)).toEqual(expect.objectContaining({
      status: "activated",
      activated_by: "user-1"
    }));
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toMatch(/Imported source: order form|secret|raw/i);
  });

  it("rejects persisted review rows without creating opt-out records", async () => {
    storedImportRows = [
      {
        id: ROW_REJECT_ID,
        organization_id: "org-1",
        batch_id: "batch-1",
        row_number: 2,
        status: "needs_review",
        accepted_weak_evidence: false,
        duplicate_confirmed: false,
        raw_row_json: {}
      }
    ];
    const { dismissSaasRenewalImportRowAction } = await import("@/lib/actions/saas-renewal-defense");
    const formData = new FormData();
    formData.set("row_id", ROW_REJECT_ID);
    formData.set("review_notes", "Dismissed as duplicate bad row.");

    await dismissSaasRenewalImportRowAction(formData);

    expect(updates.saas_renewal_import_rows?.at(-1)).toEqual(expect.objectContaining({
      status: "dismissed",
      review_notes: "Dismissed as duplicate bad row.",
      dismissed_by: "user-1"
    }));
    expect(inserts.saas_software_inventory).toHaveLength(0);
  });
});
