"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization, requireShippedRuntimeAction } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import {
  createCommercialDenialAuditLog,
  getBillingSnapshot,
  getContractTrackingLimitResult
} from "@/lib/billing/entitlements";
import { getOrganizationContractCount } from "@/lib/contracts/kernel-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const SAMPLE_CONTRACT_ACTIONS = {
  created: "contract.sample_created",
  opened: "contract.sample_opened",
  removed: "contract.sample_removed",
  movedToFirstReal: "contract.sample_moved_to_first_real"
} as const;

const SAMPLE_CONTRACT_TITLE = "Sample SaaS Renewal Agreement";
const SAMPLE_VENDOR_NAME = "Acme Analytics Cloud";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildSampleContractDates(now = new Date()) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    effectiveDate: toDateOnly(addDays(base, -320)),
    noticeDeadlineDate: toDateOnly(addDays(base, 10)),
    renewalDate: toDateOnly(addDays(base, 45)),
    expirationDate: toDateOnly(addDays(base, 45))
  };
}

export function buildSampleContractMetadata(now = new Date()) {
  const dates = buildSampleContractDates(now);
  const fieldConfidence = {
    contract_title: 1,
    counterparty_name: 1,
    effective_date: 1,
    notice_deadline_date: 1,
    renewal_date: 1,
    expiration_date: 1,
    auto_renewal: 1,
    contract_value_amount: 1,
    contract_value_currency: 1
  };
  const fieldSourceSnippets = {
    contract_title: "Synthetic sample evidence: fictional SaaS renewal agreement title.",
    counterparty_name: "Synthetic sample evidence: fictional vendor Acme Analytics Cloud.",
    notice_deadline_date: "Synthetic sample evidence: opt-out notice is due 35 days before renewal.",
    renewal_date: "Synthetic sample evidence: fictional renewal date is shown for the demo.",
    expiration_date: "Synthetic sample evidence: fictional expiration date matches the renewal date.",
    auto_renewal: "Synthetic sample evidence: fictional agreement auto-renews unless notice is given.",
    contract_value_amount: "Synthetic sample evidence: fictional annual value is 48000 USD.",
    contract_value_currency: "Synthetic sample evidence: fictional currency is USD."
  };

  return {
    contract_title: SAMPLE_CONTRACT_TITLE,
    counterparty_name: SAMPLE_VENDOR_NAME,
    contract_type: "SaaS subscription",
    effective_date: dates.effectiveDate,
    renewal_date: dates.renewalDate,
    expiration_date: dates.expirationDate,
    auto_renewal: true,
    renewal_term: "Annual",
    notice_period_value: 35,
    notice_period_unit: "days",
    notice_deadline_date: dates.noticeDeadlineDate,
    termination_window: "Submit written opt-out notice before the fictional notice deadline.",
    governing_law: null,
    payment_terms: "Annual prepaid",
    contract_value_amount: 48000,
    contract_value_currency: "USD",
    contract_value_period: "annual",
    price_change_trigger: null,
    payment_trigger: null,
    financial_data_trust_status: "reviewed_sample",
    extracted_clauses: [],
    field_confidence: fieldConfidence,
    field_source_snippets: fieldSourceSnippets,
    reminder_recommendations: [],
    needs_review: false,
    reviewer_notes: null,
    review_mode: "sample_reviewed",
    review_reason: "Synthetic sample data for first-run onboarding.",
    has_conflict: false,
    has_derived_date: false,
    has_weak_evidence: false,
    is_ocr_assisted: false,
    is_manual_without_evidence: false,
    changes_previously_verified_p0: false,
    accepted_unverified_risk_requested: false,
    contract_template_key: "sample_contract"
  };
}

function buildSampleEvidenceRows(metadataId: string, metadata: ReturnType<typeof buildSampleContractMetadata>) {
  const snippets = metadata.field_source_snippets;
  const confidence = metadata.field_confidence;
  return Object.entries(snippets).map(([fieldName, snippet]) => ({
    contract_metadata_id: metadataId,
    field_name: fieldName,
    snippet,
    confidence: confidence[fieldName as keyof typeof confidence] ?? 1,
    source: "sample"
  }));
}

function isUniqueSampleConstraint(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null;
  return maybeError?.code === "23505" || Boolean(maybeError?.message?.includes("idx_contracts_one_active_sample_per_org"));
}

async function findActiveSampleContractId(organizationId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_sample", true)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as { id?: string } | null)?.id ?? null;
}

async function enforceSampleContractCapacity(input: {
  organizationId: string;
  actorUserId: string;
}) {
  const billingSnapshot = await getBillingSnapshot(input.organizationId);
  const currentCount = await getOrganizationContractCount(input.organizationId);
  const access = getContractTrackingLimitResult(billingSnapshot, currentCount);
  if (access.allowed) return;

  await createCommercialDenialAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    feature: "manual_contracts",
    billingSnapshot,
    context: {
      contract_tracking_limit_reached: true,
      current_count: access.currentCount,
      limit: access.limit,
      source_type: "sample",
      sample_contract: true
    }
  });

  redirect("/onboarding?commercial=billing.contract_tracking_limit_reached");
}

export async function createSampleContractAction() {
  const { user, organizationId } = await requireShippedRuntimeAction("upload_import");
  const existingSampleId = await findActiveSampleContractId(organizationId);
  if (existingSampleId) {
    revalidatePath("/onboarding");
    redirect(`/dashboard/contracts/${existingSampleId}`);
  }

  await enforceSampleContractCapacity({
    organizationId,
    actorUserId: user.id
  });

  const supabase = createServerSupabaseClient();
  const metadata = buildSampleContractMetadata();
  const now = new Date().toISOString();

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .insert({
      organization_id: organizationId,
      created_by: user.id,
      status: "reviewed",
      cycle_status: "open",
      source_type: "sample",
      is_sample: true,
      owner_user_id: user.id,
      status_tag: "renewal_watch"
    })
    .select("id")
    .single();

  if (contractError) {
    if (isUniqueSampleConstraint(contractError)) {
      const id = await findActiveSampleContractId(organizationId);
      if (id) redirect(`/dashboard/contracts/${id}`);
    }
    throw contractError;
  }

  const contractId = (contract as { id: string }).id;
  const { data: metadataRow, error: metadataError } = await supabase
    .from("contract_metadata")
    .insert({
      contract_id: contractId,
      ...metadata,
      reviewed_at: now,
      reviewed_by: user.id
    })
    .select("id")
    .single();

  if (metadataError) throw metadataError;

  const evidenceRows = buildSampleEvidenceRows((metadataRow as { id: string }).id, metadata);
  const { error: evidenceError } = await supabase.from("extracted_field_evidence").insert(evidenceRows);
  if (evidenceError) throw evidenceError;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: SAMPLE_CONTRACT_ACTIONS.created,
    entityType: "contract",
    entityId: contractId,
    details: {
      source_type: "sample",
      sample_contract: true,
      synthetic_dates: {
        notice_deadline_date: metadata.notice_deadline_date,
        renewal_date: metadata.renewal_date,
        expiration_date: metadata.expiration_date
      },
      owner_assigned_to_actor: true,
      reminders_auto_created: false,
      vendor_send_enabled: false
    }
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contracts");
  redirect(`/dashboard/contracts/${contractId}`);
}

export async function removeSampleContractAction(contractId: string, formData: FormData) {
  const { user, organizationId } = await requireShippedRuntimeAction("upload_import");
  const confirmed = formData.get("confirm_sample_removal") === "yes";
  if (!confirmed) {
    throw new Error("Confirm sample removal before continuing.");
  }

  const supabase = createServerSupabaseClient();
  const { data: contract, error: lookupError } = await supabase
    .from("contracts")
    .select("id, is_sample, status")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!contract) throw new Error("Sample contract not found for the active organization.");
  if (!(contract as { is_sample?: boolean }).is_sample) {
    throw new Error("Only sample contracts can be removed from the sample onboarding action.");
  }

  const { error: updateError } = await supabase
    .from("contracts")
    .update({
      status: "archived",
      cycle_status: "closed",
      status_tag: "sample_removed"
    })
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .eq("is_sample", true);

  if (updateError) throw updateError;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: SAMPLE_CONTRACT_ACTIONS.removed,
    entityType: "contract",
    entityId: contractId,
    details: {
      source_type: "sample",
      sample_contract: true,
      removal_mode: "archived",
      real_contract_deleted: false
    }
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contracts");
  revalidatePath(`/dashboard/contracts/${contractId}`);
  redirect("/onboarding");
}

export async function recordSampleContractOpened(contractId: string) {
  const { user, organizationId } = await requireOrganization();
  const supabase = createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, is_sample")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (contractError) throw contractError;
  if (!(contract as { is_sample?: boolean } | null)?.is_sample) return;

  const { data: existingAudit, error: auditLookupError } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contract_id", contractId)
    .eq("action", SAMPLE_CONTRACT_ACTIONS.opened)
    .gte("created_at", `${today}T00:00:00.000Z`)
    .limit(1);

  if (auditLookupError) throw auditLookupError;
  if (existingAudit?.length) return;

  await createAuditLog(
    {
      organizationId,
      actorUserId: user.id,
      contractId,
      action: SAMPLE_CONTRACT_ACTIONS.opened,
      entityType: "contract",
      entityId: contractId,
      details: {
        source_type: "sample",
        sample_contract: true
      }
    },
    { mode: "best_effort" }
  );
}

export async function recordSampleToFirstRealContractStartedIfNeeded(input: {
  organizationId: string;
  actorUserId: string;
  realContractId: string;
  realContractSourceType: "upload" | "manual";
}) {
  const sampleContractId = await findActiveSampleContractId(input.organizationId);
  if (!sampleContractId) return;
  const supabase = createServerSupabaseClient();
  const { data: existingAudit, error } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("action", SAMPLE_CONTRACT_ACTIONS.movedToFirstReal)
    .limit(1);

  if (error) throw error;
  if (existingAudit?.length) return;

  await createAuditLog(
    {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      contractId: input.realContractId,
      action: SAMPLE_CONTRACT_ACTIONS.movedToFirstReal,
      entityType: "contract",
      entityId: input.realContractId,
      details: {
        source_type: input.realContractSourceType,
        sample_contract_id: sampleContractId,
        sample_contract_archived_automatically: false
      } satisfies Record<string, Json>
    },
    { mode: "best_effort" }
  );
}
