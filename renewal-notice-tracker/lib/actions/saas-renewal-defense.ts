"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getSaasOptOutClock, requireScopedSaasSoftware, type SaasOptOutClock } from "@/lib/saas/queries";
import { getOrganizationMembers, type OrganizationMember } from "@/lib/contracts/kernel-queries";
import {
  assessSaasRenewalImportRows,
  buildSaasRenewalActivationPlan,
  buildSaasRenewalImportDuplicateKey,
  parseSaasRenewalImportFile,
  type SaasRenewalImportAssessment
} from "@/lib/saas/import-cleanup";
import {
  buildSafeSaasRenewalDefenseAuditMetadata,
  calculateNoticeDeadline,
  calculateSaasContractRiskFindings,
  deriveSaasOptOutWorkflowStatus,
  getOptOutDeadlineWindow,
  getOptOutUrgency,
  type SaasOptOutWorkflowStatus,
  type NoticePeriodUnit
} from "@/lib/saas/renewal-defense";

const writeRoles = new Set(["admin", "operator"]);
const MAX_SAAS_RENEWAL_IMPORT_ROWS = 500;

function requireSaasWriteRole(role: string) {
  if (!writeRoles.has(role)) {
    throw new Error("Only admins and operators can manage SaaS renewal-defense records.");
  }
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = optionalText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const softwareSchema = z.object({
  name: z.string().trim().min(1),
  vendorName: z.string().trim().nullable(),
  category: z.string().trim().nullable(),
  ownerUserId: z.string().uuid().nullable()
});

const contractTermSchema = z.object({
  softwareId: z.string().uuid(),
  contractId: z.string().uuid().nullable(),
  renewalDate: z.string().trim().nullable(),
  expirationDate: z.string().trim().nullable(),
  noticeDeadlineDate: z.string().trim().nullable(),
  noticePeriodValue: z.number().int().positive().nullable(),
  noticePeriodUnit: z.enum(["days", "weeks", "months"]).nullable(),
  autoRenewal: z.boolean(),
  termSummary: z.string().trim().nullable(),
  contractValueAmount: z.number().nullable(),
  contractValueCurrency: z.string().trim().nullable()
});

const optOutWorkflowSchema = z.object({
  optOutWindowId: z.string().uuid(),
  ownerUserId: z.string().uuid().nullable(),
  nextAction: z.string().trim().max(240).nullable(),
  nextActionDueAt: z.string().trim().nullable(),
  workflowStatus: z.enum([
    "needs_review",
    "ready",
    "owner_assigned",
    "decision_needed",
    "resolved",
    "accepted_risk",
    "ignored"
  ]).nullable()
});

const findingStatusSchema = z.object({
  findingId: z.string().uuid(),
  status: z.enum(["resolved", "accepted_risk", "ignored"])
});

export type SaasRenewalImportPreviewResult = {
  assessment: SaasRenewalImportAssessment;
  canActivateReadyRows: boolean;
};

export type SaasRenewalImportActivationResult = {
  assessment: SaasRenewalImportAssessment;
  activatedCount: number;
  blockedCount: number;
};

async function auditSaasRenewalDefense(input: {
  organizationId: string;
  actorUserId: string;
  contractId?: string | null;
  softwareId?: string | null;
  saasTermId?: string | null;
  optOutWindowId?: string | null;
  findingId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  deadlineWindow?: ReturnType<typeof getOptOutDeadlineWindow> | null;
  amount?: number | null;
  currency?: string | null;
}) {
  await createAuditLog(
    {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      contractId: input.contractId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: buildSafeSaasRenewalDefenseAuditMetadata(input)
    },
    { mode: "best_effort" }
  );
}

function ownersByEmail(members: OrganizationMember[]) {
  return new Map(
    members
      .map((member) => {
        const email = member.user?.notification_email?.trim().toLowerCase();
        if (!email) return null;
        return [
          email,
          {
            userId: member.user_id,
            label: member.user?.full_name ?? member.user?.notification_email ?? member.user_id
          }
        ] as const;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  );
}

function existingSaasDuplicateKeys(clock: SaasOptOutClock) {
  return new Set(
    clock.items
      .map((item) =>
        buildSaasRenewalImportDuplicateKey({
          vendorName: item.software.vendor_name,
          productName: item.software.name,
          renewalDate: item.latestTerm?.renewal_date ?? null,
          noticeDeadlineDate: item.optOutWindow?.opt_out_deadline ?? item.latestTerm?.notice_deadline_date ?? null
        })
      )
      .filter((key): key is string => Boolean(key))
  );
}

async function parseAndAssessSaasRenewalImport(context: Awaited<ReturnType<typeof requireOrganization>>, formData: FormData) {
  requireSaasWriteRole(context.role);
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Upload a SaaS renewal CSV or XLSX file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseSaasRenewalImportFile(file.name, buffer);
  if (rows.length > MAX_SAAS_RENEWAL_IMPORT_ROWS) {
    throw new Error(`SaaS renewal import is limited to ${MAX_SAAS_RENEWAL_IMPORT_ROWS} rows per cleanup batch.`);
  }

  const [members, clock] = await Promise.all([
    getOrganizationMembers(context.organizationId),
    getSaasOptOutClock(context.organizationId)
  ]);

  return assessSaasRenewalImportRows(rows, {
    organizationId: context.organizationId,
    ownersByEmail: ownersByEmail(members),
    existingDuplicateKeys: existingSaasDuplicateKeys(clock)
  });
}

export async function previewSaasRenewalImportAction(
  formData: FormData
): Promise<SaasRenewalImportPreviewResult> {
  const context = await requireOrganization();
  const assessment = await parseAndAssessSaasRenewalImport(context, formData);
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "saas.import_previewed",
    entityType: "saas_renewal_import",
    toStatus: assessment.summary.rejectedCount > 0 || assessment.summary.needsReviewCount > 0 ? "needs_review" : "ready",
    amount: assessment.summary.spendAtRiskAmount,
    currency: assessment.summary.spendAtRiskCurrency
  });

  return {
    assessment,
    canActivateReadyRows: assessment.summary.readyCount > 0
  };
}

export async function activateReadySaasRenewalImportRowsAction(
  formData: FormData
): Promise<SaasRenewalImportActivationResult> {
  const context = await requireOrganization();
  const assessment = await parseAndAssessSaasRenewalImport(context, formData);
  const plan = buildSaasRenewalActivationPlan(assessment);
  const supabase = createServerSupabaseClient();
  let activatedCount = 0;

  for (const readyRow of plan.readyRows) {
    const { data: software, error: softwareError } = await supabase
      .from("saas_software_inventory")
      .insert({
        organization_id: context.organizationId,
        name: readyRow.software.name,
        vendor_name: readyRow.software.vendorName,
        category: readyRow.software.category,
        owner_user_id: readyRow.software.ownerUserId,
        created_by: context.user.id
      })
      .select("id")
      .single();

    if (softwareError) throw softwareError;
    if (!software?.id) throw new Error("SaaS software import row did not create a software record.");

    const { data: term, error: termError } = await supabase
      .from("saas_contract_terms")
      .insert({
        organization_id: context.organizationId,
        software_id: software.id,
        renewal_date: readyRow.term.renewalDate,
        auto_renewal: readyRow.term.autoRenewal,
        notice_period_value: readyRow.term.noticePeriodValue,
        notice_period_unit: readyRow.term.noticePeriodUnit,
        notice_deadline_date: readyRow.term.noticeDeadlineDate,
        term_summary: readyRow.term.termSummary,
        contract_value_amount: readyRow.term.contractValueAmount,
        contract_value_currency: readyRow.term.contractValueCurrency,
        created_by: context.user.id
      })
      .select("id")
      .single();

    if (termError) throw termError;
    if (!term?.id) throw new Error("SaaS import row did not create a contract term.");

    const urgency = getOptOutUrgency(readyRow.optOutWindow.optOutDeadline);
    const { data: optOutWindow, error: windowError } = await supabase
      .from("saas_opt_out_windows")
      .insert({
        organization_id: context.organizationId,
        software_id: software.id,
        contract_term_id: term.id,
        opt_out_deadline: readyRow.optOutWindow.optOutDeadline,
        window_closes_on: readyRow.optOutWindow.optOutDeadline,
        status: urgency === "expired" ? "expired" : "open",
        source: readyRow.optOutWindow.source,
        owner_user_id: readyRow.optOutWindow.ownerUserId,
        workflow_status: readyRow.optOutWindow.workflowStatus
      })
      .select("id")
      .single();

    if (windowError) throw windowError;

    if (readyRow.riskFindings.length > 0) {
      const { error: findingsError } = await supabase.from("saas_contract_risk_findings").insert(
        readyRow.riskFindings.map((finding) => ({
          organization_id: context.organizationId,
          software_id: software.id,
          contract_term_id: term.id,
          opt_out_window_id: optOutWindow?.id ?? null,
          finding_type: finding.findingType,
          severity: finding.severity,
          evidence_json: finding.evidence as Json
        }))
      );
      if (findingsError) throw findingsError;
    }

    activatedCount += 1;
  }

  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "saas.import_ready_rows_activated",
    entityType: "saas_renewal_import",
    toStatus: plan.blockedRows.length > 0 ? "needs_review" : "ready",
    amount: assessment.summary.spendAtRiskAmount,
    currency: assessment.summary.spendAtRiskCurrency
  });

  revalidatePath("/dashboard/saas-opt-out-clock");
  revalidatePath("/dashboard");

  return {
    assessment,
    activatedCount,
    blockedCount: plan.blockedRows.length
  };
}

export async function activateReadySaasRenewalImportRowsFormAction(formData: FormData) {
  await activateReadySaasRenewalImportRowsAction(formData);
}

export async function createSaasSoftwareAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = softwareSchema.parse({
    name: String(formData.get("name") ?? ""),
    vendorName: optionalText(formData.get("vendor_name")),
    category: optionalText(formData.get("category")),
    ownerUserId: optionalText(formData.get("owner_user_id"))
  });

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("saas_software_inventory").insert({
    organization_id: context.organizationId,
    name: payload.name,
    vendor_name: payload.vendorName,
    category: payload.category,
    owner_user_id: payload.ownerUserId,
    created_by: context.user.id
  });

  if (error) throw error;
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "saas.software_created",
    entityType: "saas_software"
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function createSaasContractTermAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = contractTermSchema.parse({
    softwareId: String(formData.get("software_id") ?? ""),
    contractId: optionalText(formData.get("contract_id")),
    renewalDate: optionalText(formData.get("renewal_date")),
    expirationDate: optionalText(formData.get("expiration_date")),
    noticeDeadlineDate: optionalText(formData.get("notice_deadline_date")),
    noticePeriodValue: optionalNumber(formData.get("notice_period_value")),
    noticePeriodUnit: optionalText(formData.get("notice_period_unit")) as NoticePeriodUnit | null,
    autoRenewal: formData.get("auto_renewal") === "on",
    termSummary: optionalText(formData.get("term_summary")),
    contractValueAmount: optionalNumber(formData.get("contract_value_amount")),
    contractValueCurrency: optionalText(formData.get("contract_value_currency"))
  });

  const scopedSoftware = await requireScopedSaasSoftware(payload.softwareId, context.organizationId);

  const noticeDeadline = calculateNoticeDeadline({
    renewalDate: payload.renewalDate,
    expirationDate: payload.expirationDate,
    noticeDeadlineDate: payload.noticeDeadlineDate,
    noticePeriodValue: payload.noticePeriodValue,
    noticePeriodUnit: payload.noticePeriodUnit,
    autoRenewal: payload.autoRenewal
  });
  const supabase = createServerSupabaseClient();
  const { data: term, error: termError } = await supabase
    .from("saas_contract_terms")
    .insert({
      organization_id: context.organizationId,
      software_id: payload.softwareId,
      contract_id: payload.contractId,
      renewal_date: payload.renewalDate,
      expiration_date: payload.expirationDate,
      auto_renewal: payload.autoRenewal,
      notice_period_value: payload.noticePeriodValue,
      notice_period_unit: payload.noticePeriodUnit,
      notice_deadline_date: noticeDeadline,
      term_summary: payload.termSummary,
      contract_value_amount: payload.contractValueAmount,
      contract_value_currency: payload.contractValueCurrency,
      created_by: context.user.id
    })
    .select("id")
    .single();

  if (termError) throw termError;
  if (!term?.id) throw new Error("SaaS contract term was not created.");

  let optOutWindowId: string | null = null;
  if (noticeDeadline) {
    const urgency = getOptOutUrgency(noticeDeadline);
    const workflowStatus = deriveSaasOptOutWorkflowStatus({
      noticeDeadline,
      ownerUserId: scopedSoftware.owner_user_id,
      openFindingTypes: [],
      today: undefined
    });
    const { data: optOutWindow, error: windowError } = await supabase
      .from("saas_opt_out_windows")
      .insert({
        organization_id: context.organizationId,
        software_id: payload.softwareId,
        contract_term_id: term.id,
        opt_out_deadline: noticeDeadline,
        window_closes_on: noticeDeadline,
        status: urgency === "expired" ? "expired" : "open",
        source: payload.noticeDeadlineDate ? "explicit" : "calculated",
        owner_user_id: scopedSoftware.owner_user_id,
        workflow_status: workflowStatus
      })
      .select("id")
      .single();

    if (windowError) throw windowError;
    optOutWindowId = optOutWindow?.id ?? null;
    await auditSaasRenewalDefense({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      contractId: payload.contractId,
      softwareId: payload.softwareId,
      saasTermId: term.id,
      optOutWindowId,
      action: "saas.opt_out_window_created",
      entityType: "saas_opt_out_window",
      entityId: optOutWindowId,
      toStatus: workflowStatus,
      deadlineWindow: getOptOutDeadlineWindow(noticeDeadline),
      amount: payload.contractValueAmount,
      currency: payload.contractValueCurrency
    });
  }

  const findings = calculateSaasContractRiskFindings({
    renewalDate: payload.renewalDate,
    expirationDate: payload.expirationDate,
    noticeDeadlineDate: payload.noticeDeadlineDate,
    noticePeriodValue: payload.noticePeriodValue,
    noticePeriodUnit: payload.noticePeriodUnit,
    autoRenewal: payload.autoRenewal
  });

  if (findings.length > 0) {
    const { data: createdFindings, error: findingsError } = await supabase.from("saas_contract_risk_findings").insert(
      findings.map((finding) => ({
        organization_id: context.organizationId,
        software_id: payload.softwareId,
        contract_term_id: term.id,
        opt_out_window_id: optOutWindowId,
        finding_type: finding.findingType,
        severity: finding.severity,
        evidence_json: finding.evidence as Json
      }))
    ).select("id, finding_type, severity");

    if (findingsError) throw findingsError;
    for (const finding of createdFindings ?? []) {
      await auditSaasRenewalDefense({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        contractId: payload.contractId,
        softwareId: payload.softwareId,
        saasTermId: term.id,
        optOutWindowId,
        findingId: finding.id,
        action: "saas.risk_finding_created",
        entityType: "saas_contract_risk_finding",
        entityId: finding.id,
        toStatus: "open",
        deadlineWindow: noticeDeadline ? getOptOutDeadlineWindow(noticeDeadline) : "missing",
        amount: payload.contractValueAmount,
        currency: payload.contractValueCurrency
      });
    }
  }

  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId: payload.contractId,
    softwareId: payload.softwareId,
    saasTermId: term.id,
    action: payload.contractId ? "saas.term_linked_to_contract" : "saas.term_created",
    entityType: "saas_contract_term",
    entityId: term.id,
    deadlineWindow: noticeDeadline ? getOptOutDeadlineWindow(noticeDeadline) : "missing",
    amount: payload.contractValueAmount,
    currency: payload.contractValueCurrency
  });

  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function updateSaasOptOutWindowWorkflowAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = optOutWorkflowSchema.parse({
    optOutWindowId: String(formData.get("opt_out_window_id") ?? ""),
    ownerUserId: optionalText(formData.get("owner_user_id")),
    nextAction: optionalText(formData.get("next_action")),
    nextActionDueAt: optionalText(formData.get("next_action_due_at")),
    workflowStatus: optionalText(formData.get("workflow_status")) as SaasOptOutWorkflowStatus | null
  });

  const supabase = createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("saas_opt_out_windows")
    .select("id, organization_id, software_id, contract_term_id, workflow_status, opt_out_deadline")
    .eq("id", payload.optOutWindowId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing?.id) throw new Error("SaaS opt-out window not found for active organization.");

  const toStatus = payload.workflowStatus ?? existing.workflow_status;
  const { error } = await supabase
    .from("saas_opt_out_windows")
    .update({
      owner_user_id: payload.ownerUserId,
      next_action: payload.nextAction,
      next_action_due_at: payload.nextActionDueAt,
      workflow_status: toStatus,
      resolved_at: toStatus === "resolved" ? new Date().toISOString() : null,
      accepted_risk_at: toStatus === "accepted_risk" ? new Date().toISOString() : null,
      ignored_at: toStatus === "ignored" ? new Date().toISOString() : null
    })
    .eq("id", payload.optOutWindowId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    softwareId: existing.software_id,
    saasTermId: existing.contract_term_id,
    optOutWindowId: existing.id,
    action: payload.ownerUserId ? "saas.owner_assigned" : "saas.next_action_updated",
    entityType: "saas_opt_out_window",
    entityId: existing.id,
    fromStatus: existing.workflow_status,
    toStatus,
    deadlineWindow: getOptOutDeadlineWindow(existing.opt_out_deadline)
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
}

export async function updateSaasRiskFindingStatusAction(formData: FormData) {
  const context = await requireOrganization();
  requireSaasWriteRole(context.role);

  const payload = findingStatusSchema.parse({
    findingId: String(formData.get("finding_id") ?? ""),
    status: String(formData.get("status") ?? "")
  });

  const supabase = createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("saas_contract_risk_findings")
    .select("id, organization_id, software_id, contract_term_id, opt_out_window_id, status")
    .eq("id", payload.findingId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing?.id) throw new Error("SaaS risk finding not found for active organization.");

  const { error } = await supabase
    .from("saas_contract_risk_findings")
    .update({ status: payload.status })
    .eq("id", payload.findingId)
    .eq("organization_id", context.organizationId);

  if (error) throw error;
  await auditSaasRenewalDefense({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    softwareId: existing.software_id,
    saasTermId: existing.contract_term_id,
    optOutWindowId: existing.opt_out_window_id,
    findingId: existing.id,
    action: payload.status === "accepted_risk" ? "saas.risk_accepted" : "saas.risk_finding_resolved",
    entityType: "saas_contract_risk_finding",
    entityId: existing.id,
    fromStatus: existing.status,
    toStatus: payload.status
  });
  revalidatePath("/dashboard/saas-opt-out-clock");
}
