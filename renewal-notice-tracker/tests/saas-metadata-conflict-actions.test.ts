import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const revalidatePath = vi.fn();

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const TERM_ID = "00000000-0000-4000-8000-000000000002";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000003";
const SOFTWARE_ID = "00000000-0000-4000-8000-000000000004";
const OWNER_ID = "00000000-0000-4000-8000-000000000005";
const ACTOR_ID = "00000000-0000-4000-8000-000000000006";
const RESOLUTION_ID = "00000000-0000-4000-8000-000000000007";

type StoredRow = Record<string, unknown>;

let storedTerms: StoredRow[] = [];
let storedContracts: StoredRow[] = [];
let storedResolutions: StoredRow[] = [];
let storedFindings: StoredRow[] = [];
const inserts: Record<string, StoredRow[]> = {};
const updates: Record<string, StoredRow[]> = {};

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

function rowsFor(table: string) {
  if (table === "saas_contract_terms") return storedTerms;
  if (table === "contracts") return storedContracts;
  if (table === "saas_contract_metadata_conflict_resolutions") return storedResolutions;
  if (table === "saas_contract_risk_findings") return storedFindings;
  return [];
}

function matches(row: StoredRow, filters: Record<string, unknown>, nullFields: Set<string>) {
  return Object.entries(filters).every(([field, value]) => row[field] === value) &&
    Array.from(nullFields).every((field) => row[field] === null || row[field] === undefined);
}

function queryRows(table: string, filters: Record<string, unknown>, nullFields: Set<string>) {
  return rowsFor(table).filter((row) => matches(row, filters, nullFields));
}

function createSelectQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const nullFields = new Set<string>();
  const query = {
    eq(field: string, value: unknown) {
      filters[field] = value;
      return query;
    },
    is(field: string, value: unknown) {
      if (value === null) nullFields.add(field);
      return query;
    },
    maybeSingle() {
      return Promise.resolve({ data: queryRows(table, filters, nullFields)[0] ?? null, error: null });
    },
    single() {
      return Promise.resolve({ data: queryRows(table, filters, nullFields)[0] ?? null, error: null });
    },
    then(
      resolve: (value: { data: StoredRow[]; error: null }) => unknown,
      reject: (reason: unknown) => unknown
    ) {
      try {
        return resolve({ data: queryRows(table, filters, nullFields), error: null });
      } catch (error) {
        return reject(error);
      }
    }
  };
  return query;
}

function createUpdateQuery(table: string, payload: StoredRow) {
  const filters: Record<string, unknown> = {};
  const nullFields = new Set<string>();
  const query = {
    eq(field: string, value: unknown) {
      filters[field] = value;
      return query;
    },
    is(field: string, value: unknown) {
      if (value === null) nullFields.add(field);
      return query;
    },
    then(
      resolve: (value: { error: null }) => unknown,
      reject: (reason: unknown) => unknown
    ) {
      updates[table] = [...(updates[table] ?? []), payload];
      const rows = rowsFor(table);
      for (const row of rows) {
        if (matches(row, filters, nullFields)) {
          Object.assign(row, payload);
        }
      }
      try {
        return resolve({ error: null });
      } catch (error) {
        return reject(error);
      }
    }
  };
  return query;
}

function createInsertQuery(table: string, payload: StoredRow | StoredRow[]) {
  const rows = Array.isArray(payload) ? payload : [payload];
  inserts[table] = [...(inserts[table] ?? []), ...rows];
  if (table === "saas_contract_metadata_conflict_resolutions") {
    storedResolutions.push(...rows.map((row, index) => ({
      id: row.id ?? `00000000-0000-4000-8000-00000000010${index}`,
      reopened_at: null,
      ...row
    })));
  }
  return {
    then(
      resolve: (value: { error: null }) => unknown,
      reject: (reason: unknown) => unknown
    ) {
      try {
        return resolve({ error: null });
      } catch (error) {
        return reject(error);
      }
    }
  };
}

function supabaseMock() {
  return {
    from: (table: string) => ({
      select: () => createSelectQuery(table),
      insert: (payload: StoredRow | StoredRow[]) => createInsertQuery(table, payload),
      update: (payload: StoredRow) => createUpdateQuery(table, payload)
    })
  };
}

function conflictForm(input: {
  fieldName: string;
  trustedSource?: string;
  manualOverride?: string;
  resolutionReason?: string;
}) {
  const formData = new FormData();
  formData.set("saas_term_id", TERM_ID);
  formData.set("field_name", input.fieldName);
  formData.set("trusted_source", input.trustedSource ?? "contract_metadata");
  if (input.manualOverride !== undefined) formData.set("manual_override", input.manualOverride);
  if (input.resolutionReason !== undefined) formData.set("resolution_reason", input.resolutionReason);
  return formData;
}

function reopenForm(resolutionId = RESOLUTION_ID) {
  const formData = new FormData();
  formData.set("resolution_id", resolutionId);
  formData.set("reason", "Reopening after reviewed SaaS import correction.");
  return formData;
}

function setActor(role: string, userId = ACTOR_ID) {
  requireOrganization.mockResolvedValue({
    user: { id: userId, email: "operator@example.com" },
    organizationId: ORG_ID,
    role
  });
}

function seedConflictRows() {
  storedTerms = [
    {
      id: TERM_ID,
      organization_id: ORG_ID,
      software_id: SOFTWARE_ID,
      contract_id: CONTRACT_ID,
      renewal_date: "2026-10-01",
      expiration_date: null,
      notice_deadline_date: "2026-08-01",
      notice_period_value: null,
      notice_period_unit: null,
      auto_renewal: true,
      contract_value_amount: 50000,
      contract_value_currency: "USD"
    }
  ];
  storedContracts = [
    {
      id: CONTRACT_ID,
      organization_id: ORG_ID,
      owner_user_id: OWNER_ID,
      contract_metadata: {
        renewal_date: "2026-10-01",
        expiration_date: null,
        notice_deadline_date: "2026-08-15",
        auto_renewal: false,
        contract_value_amount: 75000,
        contract_value_currency: "USD",
        private_note: "RAW_PRIVATE_NOTE_SHOULD_NOT_LEAK"
      }
    }
  ];
  storedResolutions = [];
  storedFindings = [
    {
      id: "finding-1",
      organization_id: ORG_ID,
      software_id: SOFTWARE_ID,
      contract_term_id: TERM_ID,
      finding_type: "contract_saas_metadata_conflict",
      status: "open"
    }
  ];
}

describe("SaaS metadata conflict action hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(inserts)) inserts[key] = [];
    for (const key of Object.keys(updates)) updates[key] = [];
    seedConflictRows();
    setActor("operator");
    createServerSupabaseClient.mockReturnValue(supabaseMock());
    createAuditLog.mockResolvedValue(undefined);
  });

  it.each(["admin", "operator", "reviewer"])("%s can resolve an organization-scoped SaaS metadata conflict", async (role) => {
    setActor(role);
    const { resolveSaasMetadataConflictAction } = await import("@/lib/actions/saas-renewal-defense");

    await resolveSaasMetadataConflictAction(conflictForm({ fieldName: "notice_deadline_date" }));

    expect(storedResolutions).toHaveLength(1);
    expect(storedResolutions[0]).toEqual(expect.objectContaining({
      organization_id: ORG_ID,
      contract_id: CONTRACT_ID,
      software_id: SOFTWARE_ID,
      saas_term_id: TERM_ID,
      field_name: "notice_deadline_date",
      trusted_source: "contract_metadata"
    }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "saas.metadata_conflict_resolved",
      details: expect.objectContaining({
        organizationId: ORG_ID,
        fieldName: "notice_deadline_date",
        trustedSource: "contract_metadata"
      })
    }), { mode: "best_effort" });
  }, 10000);

  it.each(["member", "owner"])("blocks unrelated %s users from resolving conflicts", async (role) => {
    setActor(role, "00000000-0000-4000-8000-000000000099");
    const { resolveSaasMetadataConflictAction } = await import("@/lib/actions/saas-renewal-defense");

    await expect(
      resolveSaasMetadataConflictAction(conflictForm({ fieldName: "notice_deadline_date" }))
    ).rejects.toThrow("Only admins, operators, reviewers, or the linked contract owner");

    expect(storedResolutions).toHaveLength(0);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("allows the linked contract owner to resolve only their own conflict", async () => {
    setActor("owner", OWNER_ID);
    const { resolveSaasMetadataConflictAction } = await import("@/lib/actions/saas-renewal-defense");

    await resolveSaasMetadataConflictAction(conflictForm({ fieldName: "auto_renewal", trustedSource: "saas_term" }));

    expect(storedResolutions).toHaveLength(1);
    expect(storedResolutions[0]?.resolved_by_user_id).toBe(OWNER_ID);
  });

  it.each([
    ["renewal_date", "2026-02-31", "valid YYYY-MM-DD date"],
    ["notice_deadline_date", "08/15/2026", "YYYY-MM-DD"],
    ["contract_value_amount", "-1", "non-negative number"],
    ["contract_value_amount", "NaN", "non-negative number"],
    ["contract_value_currency", "usd", "3 uppercase letters"],
    ["auto_renewal", "yes", "exactly true or false"]
  ])("rejects invalid manual override for %s without audit or resolution rows", async (fieldName, manualOverride, message) => {
    const metadata = storedContracts[0]?.contract_metadata as StoredRow;
    if (fieldName === "renewal_date") metadata.renewal_date = "2026-11-01";
    if (fieldName === "contract_value_currency") metadata.contract_value_currency = "EUR";
    const { resolveSaasMetadataConflictAction } = await import("@/lib/actions/saas-renewal-defense");

    await expect(
      resolveSaasMetadataConflictAction(conflictForm({
        fieldName,
        trustedSource: "manual_override",
        manualOverride,
        resolutionReason: "Finance reviewed the trusted renewal-control record."
      }))
    ).rejects.toThrow(message);

    expect(storedResolutions).toHaveLength(0);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("creates one active resolution per unresolved conflict when applying recommended defaults", async () => {
    const { bulkResolveSaasMetadataConflictsWithRecommendedDefaultsAction } = await import("@/lib/actions/saas-renewal-defense");
    const formData = new FormData();
    formData.set("saas_term_id", TERM_ID);

    await bulkResolveSaasMetadataConflictsWithRecommendedDefaultsAction(formData);

    expect(storedResolutions.map((row) => row.field_name).sort()).toEqual([
      "auto_renewal",
      "contract_value_amount",
      "notice_deadline_date"
    ]);
    expect(storedResolutions.every((row) => row.reopened_at === null)).toBe(true);
    expect(storedFindings[0]?.status).toBe("resolved");
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "saas.metadata_conflict_bulk_resolved"
    }), { mode: "best_effort" });
  });

  it("reopens the active resolution and reopens the SaaS metadata conflict risk finding", async () => {
    storedResolutions = [
      {
        id: RESOLUTION_ID,
        organization_id: ORG_ID,
        contract_id: CONTRACT_ID,
        software_id: SOFTWARE_ID,
        saas_term_id: TERM_ID,
        field_name: "notice_deadline_date",
        trusted_source: "contract_metadata",
        resolution_reason: "Initial reviewer decision.",
        reopened_at: null
      }
    ];
    storedFindings[0]!.status = "resolved";
    const { reopenSaasMetadataConflictResolutionAction } = await import("@/lib/actions/saas-renewal-defense");

    await reopenSaasMetadataConflictResolutionAction(reopenForm());

    expect(storedResolutions[0]?.reopened_at).toEqual(expect.any(String));
    expect(storedResolutions[0]?.reopened_by_user_id).toBe(ACTOR_ID);
    expect(storedFindings[0]?.status).toBe("open");
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "saas.metadata_conflict_reopened",
      details: expect.objectContaining({
        fromStatus: "resolved",
        toStatus: "open"
      })
    }), { mode: "best_effort" });
  });

  it("keeps conflict-resolution audit metadata safe and non-mutating", async () => {
    const { resolveSaasMetadataConflictAction } = await import("@/lib/actions/saas-renewal-defense");

    await resolveSaasMetadataConflictAction(conflictForm({
      fieldName: "notice_deadline_date",
      trustedSource: "manual_override",
      manualOverride: "2026-08-20",
      resolutionReason: "Reviewer selected finance-approved opt-out evidence."
    }));

    const auditPayload = JSON.stringify(createAuditLog.mock.calls);
    expect(auditPayload).not.toMatch(/RAW_PRIVATE_NOTE_SHOULD_NOT_LEAK|raw contract text|provider payload|private notes|sensitive row/i);
    expect(updates.contract_metadata ?? []).toHaveLength(0);
    expect(updates.saas_contract_terms ?? []).toHaveLength(0);
  });
});
