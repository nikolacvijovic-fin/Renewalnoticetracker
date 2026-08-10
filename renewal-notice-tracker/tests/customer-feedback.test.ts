import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_FEEDBACK_EVENT_CONTRACTS,
  CUSTOMER_FEEDBACK_TYPES,
  buildCustomerFeedbackIdempotencyKey,
  buildCustomerFeedbackEventMetadata,
  buildCustomerFeedbackInsert,
  sanitizeCustomerFeedbackSafeContext
} from "@/lib/customer-feedback/customer-feedback";
import { buildFounderBetaFeedbackSummary } from "@/lib/internal/beta-reliability";
import { PRODUCT_EVENT_TAXONOMY } from "@/lib/product/event-taxonomy";

const requireOrganization = vi.fn();
const assertCanUseShippedAction = vi.fn();
const requireScopedContract = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const emitOperationalEvent = vi.fn();
const revalidatePath = vi.fn();
const requireInternalRole = vi.fn();
const getCustomerFeedbackByIdForInternalStatusChange = vi.fn();
const updateCustomerFeedbackStatusAsInternal = vi.fn();

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireOrganization,
    assertCanUseShippedAction
  };
});

vi.mock("@/lib/contracts/kernel-queries", () => ({
  requireScopedContract
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

vi.mock("@/lib/internal-access", () => ({
  requireInternalRole
}));

vi.mock("@/lib/internal/repositories/admin-beta-reliability-repository", () => ({
  getCustomerFeedbackByIdForInternalStatusChange,
  updateCustomerFeedbackStatusAsInternal
}));

const repoRoot = process.cwd();

function formData(entries: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

function insertableSupabaseMock(error: { code?: string; message?: string } | null = null) {
  const single = vi.fn().mockResolvedValue({
    data: error ? null : { id: "feedback-1" },
    error
  });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const duplicateLimit = vi.fn().mockResolvedValue({
    data: [
      {
        id: "feedback-duplicate",
        feedback_type: "request_help",
        status: "open",
        created_at: "2026-08-10T10:00:00.000Z"
      }
    ],
    error: null
  });
  const duplicateEqSecond = vi.fn(() => ({ limit: duplicateLimit }));
  const duplicateEqFirst = vi.fn(() => ({ eq: duplicateEqSecond }));
  const selectDuplicate = vi.fn(() => ({ eq: duplicateEqFirst }));
  const from = vi.fn(() => ({ insert, select: selectDuplicate }));
  createServerSupabaseClient.mockReturnValue({ from });
  return { from, insert, select, single, selectDuplicate, duplicateLimit };
}

describe("customer feedback model", () => {
  it("uses the shipped feedback taxonomy requested by the beta support workflow", () => {
    expect(CUSTOMER_FEEDBACK_TYPES).toEqual([
      "deadline_correct",
      "deadline_incorrect",
      "extraction_problem",
      "reminder_problem",
      "upload_problem",
      "export_problem",
      "billing_problem",
      "request_help",
      "other"
    ]);
  });

  it("builds capped feedback rows and strips unsafe context", () => {
    const row = buildCustomerFeedbackInsert({
      organizationId: "org-1",
      submittedByUserId: "user-1",
      contractId: "contract-1",
      entityType: "contract_metadata",
      entityId: "contract-1",
      feedbackType: "deadline_incorrect",
      severity: "urgent",
      message: `${"This deadline looks wrong. ".repeat(120)} raw contract text`,
      safeContext: {
        currentRoute: "/dashboard/contracts/contract-1",
        fieldName: "notice_deadline_date",
        reviewStatus: "needs_review",
        provider_payload: "provider payload",
        rawContractText: "raw contract text",
        email_body: "email body",
        exportType: "customer_data_export",
        storagePath: "storage/contracts/acme.pdf",
        sourceSurface: "contract_detail_metadata"
      }
    });
    const serialized = JSON.stringify(row);

    expect(row.message?.length).toBeLessThanOrEqual(1000);
    expect(row.safe_context).toEqual({
      currentRoute: "/dashboard/contracts/contract-1",
      contractId: "contract-1",
      fieldName: "notice_deadline_date",
      reviewStatus: "needs_review",
      exportType: "customer_data_export",
      sourceSurface: "contract_detail_metadata",
      organizationId: "org-1",
      actorUserId: "user-1",
      entityType: "contract_metadata",
      entityId: "contract-1"
    });
    expect(row.idempotency_key).toMatch(/^customer_feedback:[a-f0-9]{64}$/);
    expect(serialized).not.toContain("raw contract text");
    expect(serialized).not.toContain("provider payload");
    expect(serialized).not.toContain("email body");
    expect(serialized).not.toContain("storage/contracts");
  });

  it("allows optional messages for one-click deadline correctness feedback", () => {
    const row = buildCustomerFeedbackInsert({
      organizationId: "org-1",
      submittedByUserId: "user-1",
      contractId: "contract-1",
      feedbackType: "deadline_correct",
      message: ""
    });

    expect(row.message).toBeNull();
    expect(row.feedback_type).toBe("deadline_correct");
  });

  it("uses short-bucket SHA-256 idempotency so immediate duplicates collapse but later reports work", () => {
    const immediate = buildCustomerFeedbackIdempotencyKey({
      organizationId: "org-1",
      submittedByUserId: "user-1",
      contractId: "contract-1",
      feedbackType: "deadline_incorrect",
      message: "Deadline looks wrong",
      submittedAt: new Date("2026-08-10T10:00:00.000Z")
    });
    const sameBucket = buildCustomerFeedbackIdempotencyKey({
      organizationId: "org-1",
      submittedByUserId: "user-1",
      contractId: "contract-1",
      feedbackType: "deadline_incorrect",
      message: "Deadline looks wrong",
      submittedAt: new Date("2026-08-10T10:03:00.000Z")
    });
    const later = buildCustomerFeedbackIdempotencyKey({
      organizationId: "org-1",
      submittedByUserId: "user-1",
      contractId: "contract-1",
      feedbackType: "deadline_incorrect",
      message: "Deadline looks wrong",
      submittedAt: new Date("2026-08-10T10:10:00.000Z")
    });

    expect(immediate).toBe(sameBucket);
    expect(immediate).not.toBe(later);
    expect(immediate).toMatch(/^customer_feedback:[a-f0-9]{64}$/);
  });

  it("enforces feedback type enum and safe status event metadata", () => {
    expect(() =>
      buildCustomerFeedbackInsert({
        organizationId: "org-1",
        submittedByUserId: "user-1",
        feedbackType: "crm_sync_issue" as never,
        message: "Help"
      })
    ).toThrow("feedback_type_invalid");

    const metadata = buildCustomerFeedbackEventMetadata({
      organizationId: "org-1",
      actorUserId: "support-1",
      feedbackId: "feedback-1",
      fromStatus: "open",
      toStatus: "resolved",
      feedbackType: "export_problem",
      severity: "high",
      entityType: "export_center",
      entityId: null
    });

    expect(metadata).toMatchObject({
      organizationId: "org-1",
      actorUserId: "support-1",
      feedbackId: "feedback-1",
      feedbackType: "export_problem",
      severity: "high",
      fromStatus: "open",
      toStatus: "resolved"
    });
    expect(JSON.stringify(metadata)).not.toContain("Help");
  });

  it("captures extraction field context without mutating metadata", () => {
    const context = sanitizeCustomerFeedbackSafeContext({
      currentRoute: "/dashboard/contracts/contract-1",
      contractId: "contract-1",
      fieldName: "notice_deadline_date",
      reviewStatus: "pending_review",
      normalizedValue: "2026-09-01",
      rawExtractedClause: "full extracted clause"
    });

    expect(context).toEqual({
      currentRoute: "/dashboard/contracts/contract-1",
      contractId: "contract-1",
      fieldName: "notice_deadline_date",
      reviewStatus: "pending_review"
    });
    const source = fs.readFileSync(path.join(repoRoot, "lib", "actions", "customer-feedback.ts"), "utf8");
    expect(source).not.toContain("applyAcceptedFieldsToContractMetadata");
  });

  it("summarizes open and urgent feedback for founder beta health without raw previews", () => {
    const summary = buildFounderBetaFeedbackSummary([
      {
        id: "feedback-1",
        organizationId: "org-1",
        organizationName: "Acme",
        contractId: "contract-1",
        entityType: "contract_metadata",
        entityId: "contract-1",
        submittedByUserId: "user-1",
        feedbackType: "deadline_incorrect",
        severity: "urgent",
        status: "open",
        messagePreview: "Deadline wrong with provider payload and private note",
        createdAt: "2026-08-09T00:00:00.000Z"
      },
      {
        id: "feedback-2",
        organizationId: "org-2",
        organizationName: "Beta",
        contractId: null,
        entityType: "export_center",
        entityId: null,
        submittedByUserId: "user-2",
        feedbackType: "export_problem",
        severity: "medium",
        status: "resolved",
        messagePreview: "Resolved issue",
        createdAt: "2026-08-08T00:00:00.000Z"
      }
    ]);

    expect(summary.openCount).toBe(1);
    expect(summary.urgentCount).toBe(1);
    expect(summary.byType).toEqual({ deadline_incorrect: 1 });
    expect(summary.byOrganization).toEqual({ Acme: 1 });
    expect(JSON.stringify(summary)).not.toContain("provider payload");
    expect(JSON.stringify(summary)).not.toContain("private note");
  });
});

describe("customer feedback action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireOrganization.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "operator"
    });
    assertCanUseShippedAction.mockResolvedValue(undefined);
    requireScopedContract.mockResolvedValue({ id: "contract-1" });
    createAuditLog.mockResolvedValue({ ok: true });
    trackServerAnalyticsEvent.mockResolvedValue({ inserted: true });
    emitOperationalEvent.mockResolvedValue({ emitted: true });
    requireInternalRole.mockResolvedValue({ user: { id: "support-1" }, role: "internal_support" });
    getCustomerFeedbackByIdForInternalStatusChange.mockResolvedValue({
      id: "feedback-1",
      organization_id: "org-1",
      contract_id: "contract-1",
      feedback_type: "deadline_incorrect",
      severity: "high",
      status: "open",
      entity_type: "contract_metadata",
      entity_id: "contract-1"
    });
    updateCustomerFeedbackStatusAsInternal.mockResolvedValue(undefined);
  });

  it("submits contract-context feedback with shipped permission, scoped contract check, and audit-safe metadata", async () => {
    const supabase = insertableSupabaseMock();
    const { submitCustomerFeedbackFormAction } = await import("@/lib/actions/customer-feedback");

    await submitCustomerFeedbackFormAction(
      formData({
        contract_id: "contract-1",
        entity_type: "contract_metadata",
        entity_id: "contract-1",
        current_route: "/dashboard/contracts/contract-1",
        source_surface: "contract_detail_metadata",
        field_name: "notice_deadline_date",
        feedback_type: "deadline_incorrect",
        severity: "urgent",
        message: "This deadline looks wrong. raw contract text",
        provider_payload: "provider payload"
      })
    );

    expect(assertCanUseShippedAction).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "submit_feedback"
    );
    expect(requireScopedContract).toHaveBeenCalledWith("contract-1", "org-1");
    expect(supabase.from).toHaveBeenCalledWith("customer_feedback");
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        contract_id: "contract-1",
        feedback_type: "deadline_incorrect",
        severity: "urgent",
        status: "open",
        idempotency_key: expect.stringMatching(/^customer_feedback:/),
        safe_context: expect.objectContaining({
          currentRoute: "/dashboard/contracts/contract-1",
          fieldName: "notice_deadline_date",
          sourceSurface: "contract_detail_metadata"
        })
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        action: "feedback.submitted",
        entityType: "customer_feedback",
        entityId: "feedback-1",
        details: expect.objectContaining({
          feedbackId: "feedback-1",
          feedbackType: "deadline_incorrect",
          severity: "urgent"
        })
      }),
      { mode: "best_effort" }
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feedback.deadline_correctness_recorded",
        details: expect.objectContaining({ deadlineCorrect: false })
      }),
      { mode: "best_effort" }
    );
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "deadline_correctness_recorded",
        properties: expect.objectContaining({
          feedback_type: "deadline_incorrect",
          severity: "urgent",
          source_surface: "contract_detail_metadata"
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "customer_feedback_submitted_monitoring",
        severity: "P2",
        alert: true,
        metadata: expect.objectContaining({
          feedbackId: "feedback-1",
          feedbackType: "deadline_incorrect"
        })
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain("This deadline looks wrong");
    expect(JSON.stringify(trackServerAnalyticsEvent.mock.calls)).not.toContain("This deadline looks wrong");
    expect(JSON.stringify(emitOperationalEvent.mock.calls)).not.toContain("raw contract text");
  });

  it("returns the existing feedback reference when an immediate duplicate is detected", async () => {
    insertableSupabaseMock({ code: "23505", message: "duplicate key" });
    const { submitCustomerFeedbackFormAction } = await import("@/lib/actions/customer-feedback");

    const result = await submitCustomerFeedbackFormAction(
      formData({
        current_route: "/dashboard",
        source_surface: "dashboard_workspace_help",
        feedback_type: "request_help",
        severity: "medium"
      })
    );

    expect(createAuditLog).not.toHaveBeenCalled();
    expect(trackServerAnalyticsEvent).not.toHaveBeenCalled();
    expect(emitOperationalEvent).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result).toMatchObject({
      id: "feedback-duplicate",
      reference: "FB-FEEDBACK",
      duplicate: true,
      status: "open"
    });
  });

  it("captures export issue context without exported file contents", async () => {
    const supabase = insertableSupabaseMock();
    const { submitCustomerFeedbackFormAction } = await import("@/lib/actions/customer-feedback");

    await submitCustomerFeedbackFormAction(
      formData({
        current_route: "/dashboard/exports",
        entity_type: "export_center",
        export_type: "customer_data_export_center",
        source_surface: "export_center",
        feedback_type: "export_problem",
        severity: "medium",
        message: "The JSON export is missing the owner action list.",
        exported_file_content: "raw exported file content"
      })
    );

    expect(requireScopedContract).not.toHaveBeenCalled();
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: "export_center",
        safe_context: expect.objectContaining({
          currentRoute: "/dashboard/exports",
          exportType: "customer_data_export_center",
          sourceSurface: "export_center"
        })
      })
    );
    expect(JSON.stringify(supabase.insert.mock.calls)).not.toContain("raw exported file content");
  });

  it("allows only internal support/admin to change feedback status", async () => {
    const { updateCustomerFeedbackStatusFormAction } = await import("@/lib/actions/customer-feedback");

    await updateCustomerFeedbackStatusFormAction(
      formData({
        feedback_id: "feedback-1",
        organization_id: "org-1",
        status: "resolved",
        resolution_note: "Resolved after checking safe workflow state. raw contract text"
      })
    );

    expect(requireInternalRole).toHaveBeenCalledWith(["internal_admin", "internal_support"]);
    expect(updateCustomerFeedbackStatusAsInternal).toHaveBeenCalledWith({
      feedbackId: "feedback-1",
      organizationId: "org-1",
      status: "resolved",
      resolvedByUserId: "support-1",
      resolutionNote: expect.stringContaining("[redacted]")
    });
    expect(JSON.stringify(updateCustomerFeedbackStatusAsInternal.mock.calls)).not.toContain("raw contract text");
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "customer_feedback_resolved",
        properties: expect.objectContaining({
          feedback_type: "deadline_incorrect",
          to_status: "resolved"
        })
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain("raw contract text");
    expect(JSON.stringify(trackServerAnalyticsEvent.mock.calls)).not.toContain("raw contract text");
  });

  it("does not fall back to customer admin status mutation when internal auth is missing", async () => {
    requireInternalRole.mockRejectedValue(new Error("internal_forbidden"));
    const { updateCustomerFeedbackStatusFormAction } = await import("@/lib/actions/customer-feedback");

    await expect(
      updateCustomerFeedbackStatusFormAction(
        formData({
          feedback_id: "feedback-1",
          organization_id: "org-1",
          status: "resolved"
        })
      )
    ).rejects.toThrow("internal_forbidden");

    expect(requireOrganization).not.toHaveBeenCalled();
    expect(updateCustomerFeedbackStatusAsInternal).not.toHaveBeenCalled();
  });
});

describe("customer feedback release boundaries", () => {
  it("creates org-scoped RLS, contract-scope enforcement, idempotency, and no customer status update policy", () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, "supabase", "migrations", "202608090004_customer_feedback.sql"),
      "utf8"
    );

    expect(migration).toContain("create table if not exists public.customer_feedback");
    expect(migration).toContain("alter table public.customer_feedback enable row level security");
    expect(migration).toContain("members can insert organization feedback");
    expect(migration).toContain("members can read own organization feedback");
    expect(migration).toContain("submitted_by_user_id = auth.uid()");
    expect(migration).toContain("idx_customer_feedback_idempotency");
    expect(migration).toContain("Immediate duplicate protection only");
    expect(migration).toContain("enforce_customer_feedback_contract_scope");
    expect(migration).toContain("contracts.organization_id = new.organization_id");
    expect(migration).toContain("message is null or char_length(message) between 1 and 1000");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
  });

  it("keeps customer feedback audit contracts locked to event taxonomy and docs", () => {
    const docs = fs.readFileSync(path.join(repoRoot, "docs", "EVENT_TAXONOMY.md"), "utf8");

    for (const eventName of CUSTOMER_FEEDBACK_EVENT_CONTRACTS) {
      expect(PRODUCT_EVENT_TAXONOMY).toHaveProperty(eventName);
      expect(PRODUCT_EVENT_TAXONOMY[eventName].emittedToday).toBe(true);
      expect(docs).toContain(`\`${eventName}\``);
    }

    expect(PRODUCT_EVENT_TAXONOMY.customer_feedback_submitted.emittedToday).toBe(true);
    expect(PRODUCT_EVENT_TAXONOMY.customer_feedback_submitted_monitoring.emittedToday).toBe(true);
    expect(docs).toContain("Feedback does not mutate contract metadata");
  });
});
