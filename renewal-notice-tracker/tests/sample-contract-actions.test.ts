import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const requireOrganization = vi.fn();
const requireShippedRuntimeAction = vi.fn();
const createServerSupabaseClient = vi.fn();
const getBillingSnapshot = vi.fn();
const getOrganizationContractCount = vi.fn();
const getContractTrackingLimitResult = vi.fn();
const createCommercialDenialAuditLog = vi.fn();
const createAuditLog = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
});

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireOrganization,
    requireShippedRuntimeAction
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("@/lib/contracts/kernel-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contracts/kernel-queries")>(
    "@/lib/contracts/kernel-queries"
  );
  return {
    ...actual,
    getOrganizationContractCount
  };
});

vi.mock("@/lib/billing/entitlements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/entitlements")>(
    "@/lib/billing/entitlements"
  );
  return {
    ...actual,
    getBillingSnapshot,
    getContractTrackingLimitResult,
    createCommercialDenialAuditLog
  };
});

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect
}));

function makeSelectResult<T>(data: T, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    gte: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data, error })
  };
  return query;
}

function makeSelectListResult<T>(data: T[], error: unknown = null) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    then?: (resolve: (value: { data: T[]; error: unknown }) => unknown) => unknown;
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query)
  };
  query.then = (resolve) => resolve({ data, error });
  return query;
}

function makeInsertSingleResult<T>(data: T, error: unknown = null) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({ data, error })
  };
  return query;
}

function makeInsertResult(error: unknown = null) {
  return {
    insert: vi.fn().mockResolvedValue({ error })
  };
}

function makeUpdateResult(error: unknown = null) {
  const query: {
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    then?: (resolve: (value: { error: unknown }) => unknown) => unknown;
  } = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query)
  };
  query.eq.mockImplementation(() => query);
  query.update.mockImplementation(() => query);
  Object.assign(query, {
    // Supabase query builders are awaitable. This keeps the mock small while matching the action call.
    then: (resolve: (value: { error: unknown }) => unknown) => resolve({ error })
  });
  return query;
}

function setupDefaultContext() {
  requireShippedRuntimeAction.mockResolvedValue({
    user: { id: "user-1", email: "founder@example.com" },
    organizationId: "org-1",
    role: "operator"
  });
  requireOrganization.mockResolvedValue({
    user: { id: "user-1", email: "founder@example.com" },
    organizationId: "org-1",
    role: "operator"
  });
}

describe("sample contract onboarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultContext();
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "starter",
      subscriptionStatus: "active",
      billingProvider: "paddle"
    });
    getOrganizationContractCount.mockResolvedValue(0);
    getContractTrackingLimitResult.mockReturnValue({
      allowed: true,
      currentCount: 0,
      limit: 25,
      remaining: 25,
      message: "Allowed"
    });
    createAuditLog.mockResolvedValue({ ok: true });
  });

  it("builds synthetic reviewed sample metadata with relative trusted dates and short evidence", async () => {
    const { buildSampleContractMetadata } = await import("@/lib/actions/contracts/sample");
    const metadata = buildSampleContractMetadata(new Date("2026-08-10T12:00:00.000Z"));

    expect(metadata.notice_deadline_date).toBe("2026-08-20");
    expect(metadata.renewal_date).toBe("2026-09-24");
    expect(metadata.needs_review).toBe(false);
    expect(metadata.has_weak_evidence).toBe(false);
    expect(JSON.stringify(metadata)).toContain("Synthetic sample evidence");
    for (const snippet of Object.values(metadata.field_source_snippets)) {
      expect(snippet.length).toBeLessThan(140);
    }
  }, 15000);

  it("creates one org-scoped sample contract atomically with safe audit metadata and no reminders", async () => {
    const sampleLookup = makeSelectResult(null);
    const rpc = vi.fn().mockResolvedValue({ data: "sample-contract-1", error: null });
    const from = vi.fn((table: string) => {
      if (table === "contracts" && from.mock.calls.filter(([name]) => name === "contracts").length === 1) {
        return sampleLookup;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    createServerSupabaseClient.mockReturnValue({ from, rpc });

    const { createSampleContractAction } = await import("@/lib/actions/contracts/sample");
    await expect(createSampleContractAction()).rejects.toThrow("NEXT_REDIRECT:/dashboard/contracts/sample-contract-1");

    expect(rpc).toHaveBeenCalledWith(
      "create_sample_contract_with_metadata",
      expect.objectContaining({
        p_organization_id: "org-1",
        p_actor_user_id: "user-1",
        p_metadata: expect.objectContaining({
          contract_template_key: "sample_contract",
          needs_review: false
        }),
        p_evidence: expect.arrayContaining([
          expect.objectContaining({
            field_name: "notice_deadline_date",
            source: "sample"
          })
        ])
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.sample_created",
        organizationId: "org-1",
        contractId: "sample-contract-1",
        details: expect.objectContaining({
          sample_contract: true,
          reminders_auto_created: false,
          vendor_send_enabled: false
        })
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain("raw contract text");
    expect(from).not.toHaveBeenCalledWith("reminders");
  });

  it("redirects to the active sample when concurrent atomic creation hits the unique sample constraint", async () => {
    const emptyLookup = makeSelectResult(null);
    const activeLookup = makeSelectResult({ id: "existing-sample-1" });
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "idx_contracts_one_active_sample_per_org" }
    });
    const from = vi.fn((table: string) => {
      if (table !== "contracts") throw new Error(`Unexpected table ${table}`);
      return from.mock.calls.filter(([name]) => name === "contracts").length === 1 ? emptyLookup : activeLookup;
    });
    createServerSupabaseClient.mockReturnValue({ from, rpc });

    const { createSampleContractAction } = await import("@/lib/actions/contracts/sample");
    await expect(createSampleContractAction()).rejects.toThrow("NEXT_REDIRECT:/dashboard/contracts/existing-sample-1");

    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("is idempotent when an active sample already exists", async () => {
    createServerSupabaseClient.mockReturnValue({
      from: vi.fn(() => makeSelectResult({ id: "existing-sample-1" }))
    });

    const { createSampleContractAction } = await import("@/lib/actions/contracts/sample");
    await expect(createSampleContractAction()).rejects.toThrow("NEXT_REDIRECT:/dashboard/contracts/existing-sample-1");

    expect(getBillingSnapshot).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("respects contract tracking capacity before inserting a sample", async () => {
    createServerSupabaseClient.mockReturnValue({
      from: vi.fn(() => makeSelectResult(null))
    });
    getContractTrackingLimitResult.mockReturnValue({
      allowed: false,
      currentCount: 5,
      limit: 5,
      remaining: 0,
      message: "Limit reached"
    });

    const { createSampleContractAction } = await import("@/lib/actions/contracts/sample");
    await expect(createSampleContractAction()).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding?commercial=billing.contract_tracking_limit_reached"
    );

    expect(createCommercialDenialAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        context: expect.objectContaining({
          contract_tracking_limit_reached: true,
          source_type: "sample"
        })
      })
    );
  });

  it("refuses to remove real contracts through the sample removal action", async () => {
    createServerSupabaseClient.mockReturnValue({
      from: vi.fn(() => makeSelectResult({ id: "real-contract-1", is_sample: false, status: "reviewed" }))
    });
    const formData = new FormData();
    formData.append("confirm_sample_removal", "yes");

    const { removeSampleContractAction } = await import("@/lib/actions/contracts/sample");
    await expect(removeSampleContractAction("real-contract-1", formData)).rejects.toThrow(
      "Only sample contracts can be removed"
    );

    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("archives sample contracts with safe removal audit metadata", async () => {
    const lookup = makeSelectResult({ id: "sample-contract-1", is_sample: true, status: "reviewed" });
    const update = makeUpdateResult();
    const reminderUpdate = makeUpdateResult();
    const from = vi.fn((table: string) => {
      if (table === "contracts") {
        return from.mock.calls.filter(([name]) => name === "contracts").length === 1 ? lookup : update;
      }
      if (table === "reminders") return reminderUpdate;
      throw new Error(`Unexpected table ${table}`);
    });
    createServerSupabaseClient.mockReturnValue({ from });
    const formData = new FormData();
    formData.append("confirm_sample_removal", "yes");

    const { removeSampleContractAction } = await import("@/lib/actions/contracts/sample");
    await expect(removeSampleContractAction("sample-contract-1", formData)).rejects.toThrow("NEXT_REDIRECT:/onboarding");

    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "archived",
        cycle_status: "closed",
        status_tag: "sample_removed"
      })
    );
    expect(reminderUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        processing_started_at: null,
        processing_token: null,
        next_retry_at: null
      })
    );
    expect(reminderUpdate.in).toHaveBeenCalledWith("status", ["pending", "processing", "retry_pending"]);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.sample_removed",
        details: expect.objectContaining({
          sample_contract: true,
          removal_mode: "archived",
          sample_reminders_cancelled: true,
          real_contract_deleted: false
        })
      })
    );
  });

  it("records the sample-to-real transition once with metadata-only audit evidence", async () => {
    const sampleLookup = makeSelectResult({ id: "sample-contract-1" });
    const transitionAuditLookup = makeSelectListResult<Array<{ id: string }>[number]>([]);
    const from = vi.fn((table: string) => {
      if (table === "contracts") return sampleLookup;
      if (table === "audit_logs") return transitionAuditLookup;
      throw new Error(`Unexpected table ${table}`);
    });
    createServerSupabaseClient.mockReturnValue({ from });

    const { recordSampleToFirstRealContractStartedIfNeeded } = await import("@/lib/actions/contracts/sample");
    await recordSampleToFirstRealContractStartedIfNeeded({
      organizationId: "org-1",
      actorUserId: "user-1",
      realContractId: "real-contract-1",
      realContractSourceType: "upload"
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.sample_moved_to_first_real",
        contractId: "real-contract-1",
        details: expect.objectContaining({
          source_type: "upload",
          sample_contract_id: "sample-contract-1",
          sample_contract_archived_automatically: false
        })
      }),
      { mode: "best_effort" }
    );

    createAuditLog.mockClear();
    const existingTransitionAuditLookup = makeSelectListResult([{ id: "audit-existing" }]);
    from.mockImplementation((table: string) => {
      if (table === "contracts") return sampleLookup;
      if (table === "audit_logs") return existingTransitionAuditLookup;
      throw new Error(`Unexpected table ${table}`);
    });
    await recordSampleToFirstRealContractStartedIfNeeded({
      organizationId: "org-1",
      actorUserId: "user-1",
      realContractId: "real-contract-2",
      realContractSourceType: "manual"
    });

    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("keeps sample actions free of service-role and outbound delivery paths", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/actions/contracts/sample.ts"),
      "utf8"
    );

    expect(source).not.toContain("createAdminSupabaseClient");
    expect(source).not.toContain("createPrivilegedSupabaseClient");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("recipient_email");
    expect(source).not.toContain("provider.send");
    expect(source).toContain("vendor_send_enabled: false");
  });

  it("defines the sample creation RPC as the atomic contract metadata and evidence boundary", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/202608100002_beta_hardening_sample_feedback.sql"),
      "utf8"
    );

    expect(migration).toContain("create or replace function public.create_sample_contract_with_metadata");
    expect(migration).toContain("insert into public.contracts");
    expect(migration).toContain("insert into public.contract_metadata");
    expect(migration).toContain("insert into public.extracted_field_evidence");
    expect(migration).toContain("Creates the fictional onboarding sample contract, reviewed metadata, and sample evidence in one transaction");
  });
});
