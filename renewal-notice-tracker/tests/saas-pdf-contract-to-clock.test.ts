import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateSaasContractActivationReadiness,
  normalizeSaasActivationMatchKey,
  parseSaasContractActivationResult
} from "@/lib/saas/contract-activation";
import { hasCountableSaasDeadline } from "@/lib/saas/queries";

const mocks = vi.hoisted(() => ({
  requireOrganization: vi.fn(),
  assertCanUseShippedAction: vi.fn(),
  requireScopedContract: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireOrganization: mocks.requireOrganization,
  assertCanUseShippedAction: mocks.assertCanUseShippedAction
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  requireScopedContract: mocks.requireScopedContract,
  getOrganizationMembers: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient
}));

vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("reviewed PDF contract to SaaS Opt-Out Clock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganization.mockResolvedValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
      role: "operator",
      user: { id: "22222222-2222-4222-8222-222222222222" }
    });
    mocks.requireScopedContract.mockResolvedValue({ id: "contract-1" });
    mocks.assertCanUseShippedAction.mockImplementation(async (_context, _action, target) => {
      await target?.assertScoped?.("11111111-1111-4111-8111-111111111111");
    });
    mocks.rpc.mockResolvedValue({
      data: {
        contractId: "contract-1",
        softwareId: "software-1",
        saasTermId: "term-1",
        optOutWindowId: "window-1",
        optOutDeadline: "2026-10-01",
        deadlineClassification: "auto_renewal",
        replayed: false
      },
      error: null
    });
    mocks.createServerSupabaseClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("blocks activation until one reviewed contract has coherent trusted fields", () => {
    const blocked = evaluateSaasContractActivationReadiness({
      needsReview: true,
      reviewedAt: null,
      reviewedBy: null,
      noticeDeadlineDate: null,
      deadlineVerifiedAt: null,
      autoRenewal: null,
      contractTitle: "Acme Cloud",
      counterpartyName: "Acme",
      ownerUserId: null,
      contractValueAmount: 10000,
      contractValueCurrency: null
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      "metadata_needs_review",
      "missing_verified_notice_deadline",
      "missing_auto_renewal_review",
      "missing_owner",
      "incomplete_financial_value"
    ]));

    expect(evaluateSaasContractActivationReadiness({
      needsReview: false,
      reviewedAt: "2026-09-02T10:00:00.000Z",
      reviewedBy: "reviewer-1",
      noticeDeadlineDate: "2026-10-01",
      deadlineVerifiedAt: "2026-09-02T10:00:00.000Z",
      autoRenewal: true,
      contractTitle: "Acme Cloud",
      counterpartyName: "Acme",
      ownerUserId: "owner-1",
      contractValueAmount: 10000,
      contractValueCurrency: "EUR"
    })).toMatchObject({ allowed: true, blockers: [] });
  });

  it("authorizes and scopes activation before invoking the atomic RPC", async () => {
    const { activateReviewedContractForSaasClockAction } = await import(
      "@/lib/actions/saas-renewal-defense"
    );

    const result = await activateReviewedContractForSaasClockAction("contract-1");

    expect(mocks.assertCanUseShippedAction).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "11111111-1111-4111-8111-111111111111" }),
      "review_p0",
      expect.objectContaining({ organizationId: "11111111-1111-4111-8111-111111111111" })
    );
    expect(mocks.requireScopedContract).toHaveBeenCalledWith(
      "contract-1",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(mocks.rpc).toHaveBeenCalledWith("activate_reviewed_contract_for_saas_clock_v2", {
      p_organization_id: "11111111-1111-4111-8111-111111111111",
      p_contract_id: "contract-1",
      p_software_id: null,
      p_create_new: false
    });
    expect(result).toMatchObject({
      contractId: "contract-1",
      optOutDeadline: "2026-10-01",
      replayed: false
    });
  });

  it("fails before persistence when scoped authorization is denied", async () => {
    mocks.requireScopedContract.mockRejectedValue(new Error("cross organization"));
    const { activateReviewedContractForSaasClockAction } = await import(
      "@/lib/actions/saas-renewal-defense"
    );

    await expect(activateReviewedContractForSaasClockAction("foreign-contract"))
      .rejects.toThrow("cross organization");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps reviewer metadata review separate from operational activation", async () => {
    mocks.requireOrganization.mockResolvedValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
      role: "reviewer",
      user: { id: "22222222-2222-4222-8222-222222222222" }
    });
    const { activateReviewedContractForSaasClockAction } = await import(
      "@/lib/actions/saas-renewal-defense"
    );

    await expect(activateReviewedContractForSaasClockAction("contract-1"))
      .rejects.toThrow("Only admins and operators can manage SaaS renewal-defense records.");
    expect(mocks.assertCanUseShippedAction).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("parses an idempotent replay without creating a second graph", () => {
    expect(parseSaasContractActivationResult({
      contractId: "contract-1",
      softwareId: "software-1",
      saasTermId: "term-1",
      optOutWindowId: "window-1",
      optOutDeadline: "2026-10-01",
      replayed: true
    })).toMatchObject({ replayed: true, saasTermId: "term-1" });

    expect(parseSaasContractActivationResult({
      contractId: "contract-2",
      softwareId: "software-2",
      saasTermId: "term-2",
      optOutWindowId: "window-2",
      optOutDeadline: "2026-11-01",
      deadlineClassification: "notice_only",
      replayed: false
    })).toMatchObject({ deadlineClassification: "notice_only" });
  });

  it("uses the activation RPC match key without broader legal-suffix matching", () => {
    expect(normalizeSaasActivationMatchKey(" Acme, Inc. ")).toBe("acmeinc");
    expect(normalizeSaasActivationMatchKey("Acme Inc")).toBe("acmeinc");
    expect(normalizeSaasActivationMatchKey("Acme")).not.toBe(
      normalizeSaasActivationMatchKey("Acme, Inc.")
    );
  });

  it("does not count inventory-only products as deadline records", () => {
    expect(hasCountableSaasDeadline({ effectiveOptOutDeadline: null })).toBe(false);
    expect(hasCountableSaasDeadline({ effectiveOptOutDeadline: "2026-10-01" })).toBe(true);
  });

  it("locks upload and activation idempotency, tenant checks, and audit safety in the migration", () => {
    const originalMigration = source("supabase/migrations/202609020001_saas_pdf_contract_to_clock.sql");
    const migration = source("supabase/migrations/202609030001_saas_pdf_upload_runtime_hardening.sql");
    const persistenceGuard = source("supabase/migrations/202609040001_saas_pdf_review_persistence_guard.sql");
    const betaStateGuard = source("supabase/migrations/202609050001_saas_pdf_upload_beta_state_guard.sql");
    const extractionWorker = source("lib/contracts/pdf-extraction-job.ts");
    const cleanupRepository = source("lib/contracts/repositories/admin-pdf-upload-repository.ts");
    const queries = source("lib/saas/queries.ts");
    const uploadActions = source("lib/actions/contracts/legacy.ts");

    expect(originalMigration).toContain("contracts_pdf_upload_attempt_id_unique_idx");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("contract-capacity:");
    expect(migration).toContain("v_capacity_count >= v_capacity_limit");
    expect(migration).toContain("v_organization.subscription_status = 'active'");
    expect(migration).toContain("v_organization.subscription_status = 'trialing'");
    expect(migration).toContain("v_organization.trial_ends_at >= v_now");
    expect(migration).toContain("c.expires_at > v_now");
    expect(migration).toContain("pdf_renewal_review_reasons text[]");
    expect(migration).toContain("PDF upload attempt is not available.");
    expect(migration).toContain("v_role is null or v_role not in ('admin', 'operator')");
    expect(migration).toContain("Only admins or operators can activate the Opt-Out Clock.");
    expect(migration).toContain("Contract metadata must be extracted and reviewed before activation.");
    expect(migration).toContain("activate_reviewed_contract_for_saas_clock_v2");
    expect(migration).toContain("saas-clock-activation:");
    expect(migration).toContain("deadline_classification");
    expect(migration).toContain("'notice_only'");
    expect(migration).toContain("status_tag = 'terminated'");
    expect(migration).not.toContain("status_tag = 'archived'");
    expect(migration).toContain("terminal_pdf_attempts");
    expect(migration).toContain("pdf_upload_failure_code = 'background_job_retry_exhausted'");
    expect(migration).toContain("and s.status = 'active'");
    expect(migration).toContain("returning id into v_selected_software_id");
    expect(migration).toContain("claim_saas_pdf_upload_cleanup");
    expect(migration).toContain("pdf_upload_attempt_status = 'cleanup_processing'");
    expect(migration).toContain("v_wrapper_created_software := true");
    expect(migration).toContain("v_wrapper_created_term := true");
    expect(migration).toContain("where m.contract_id = v_contract.id and m.reviewed_at is not null");
    expect(migration).toContain("where t.organization_id = p_organization_id and t.contract_id = v_contract.id");
    expect(migration).toContain("f.contract_id = v_contract.id and f.storage_deleted_at is null");
    expect(cleanupRepository).toContain('status_tag: "terminated"');
    expect(cleanupRepository).not.toContain('status_tag: "archived"');
    expect(cleanupRepository).toContain("and(pdf_upload_attempt_status.eq.failed,pdf_upload_claimed_at.lt.");
    expect(cleanupRepository).toContain("and(pdf_upload_attempt_status.eq.abandoned,pdf_upload_abandoned_at.lt.");
    expect(cleanupRepository).toContain("and(pdf_upload_attempt_status.eq.cleanup_processing,pdf_upload_cleaned_at.lt.");
    expect(cleanupRepository).toContain('client.rpc("claim_saas_pdf_upload_cleanup"');
    expect(cleanupRepository).toContain('rpc("persist_saas_pdf_extraction_for_review"');
    expect(extractionWorker).toContain("persistAdminPdfExtractionForReview");
    expect(extractionWorker).not.toContain("upsertAdminPdfContractMetadata");
    expect(extractionWorker).not.toContain("replaceAdminPdfEvidenceRows");
    expect(persistenceGuard).toContain("pg_advisory_xact_lock");
    expect(persistenceGuard).toContain("v_existing_metadata.reviewed_at is not null");
    expect(persistenceGuard).toContain("'contract_activated'");
    expect(persistenceGuard).toContain("pdf_extraction_job_id is distinct from p_job_id");
    expect(persistenceGuard).toContain("to service_role");
    expect(persistenceGuard).toContain("v_contract.status_tag = 'terminated'");
    expect(betaStateGuard).toContain("rename to claim_saas_pdf_contract_upload_core");
    expect(betaStateGuard).toContain("v_control.status <> 'active'");
    expect(betaStateGuard).toContain("v_control.founder_approved_at is null");
    expect(betaStateGuard).toContain("v_control.expires_at <= v_now");
    expect(betaStateGuard).toContain("v_control.grace_ends_at <= v_now");
    expect(betaStateGuard).toContain("Design Partner Beta is read-only");
    expect(betaStateGuard).toContain("from public, anon, authenticated, service_role");
    expect(betaStateGuard).toContain("to authenticated");
    expect(queries).toContain('.neq("status_tag", "terminated")');
    expect(cleanupRepository).not.toContain("pdf_upload_claimed_at.lt.${input.staleBeforeIso},pdf_upload_abandoned_at.lt.");
    expect(queries).toContain("normalizeSaasActivationMatchKey(candidate.name)");
    expect(queries).toContain("hasCountableSaasDeadline(item) && item.deadlineClassification");
    expect(queries).not.toContain("normalizeCounterpartyName(candidate.name)");
    expect(migration).toContain("and f.finding_type = 'auto_renewal'");
    expect(migration).toContain("revoke all on function public.claim_saas_pdf_contract_upload");
    expect(migration).toContain("revoke all on function public.activate_reviewed_contract_for_saas_clock");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toMatch(
      /raw_contract_text|provider_payload|recipient_email|message_body|private_notes/i
    );
    expect(migration).not.toMatch(/insert into public\.reminders|notification_logs|send.*email/i);
    expect(uploadActions).toContain("const linkedFile = await linkAdminPdfUploadFile");
    expect(uploadActions).toContain("if (linkedFile.error || !linkedFile.data?.id)");
    expect(uploadActions.indexOf("const linkedFile = await linkAdminPdfUploadFile")).toBeLessThan(
      uploadActions.indexOf("const extractionJob = await enqueueContractPdfExtractionJob")
    );
  });
});
