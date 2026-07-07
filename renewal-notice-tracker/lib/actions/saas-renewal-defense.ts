"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { requireScopedSaasSoftware } from "@/lib/saas/queries";
import {
  calculateNoticeDeadline,
  calculateSaasContractRiskFindings,
  getOptOutUrgency,
  type NoticePeriodUnit
} from "@/lib/saas/renewal-defense";

const writeRoles = new Set(["admin", "operator"]);

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

  await requireScopedSaasSoftware(payload.softwareId, context.organizationId);

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
    const { data: optOutWindow, error: windowError } = await supabase
      .from("saas_opt_out_windows")
      .insert({
        organization_id: context.organizationId,
        software_id: payload.softwareId,
        contract_term_id: term.id,
        opt_out_deadline: noticeDeadline,
        window_closes_on: noticeDeadline,
        status: urgency === "expired" ? "expired" : "open",
        source: payload.noticeDeadlineDate ? "explicit" : "calculated"
      })
      .select("id")
      .single();

    if (windowError) throw windowError;
    optOutWindowId = optOutWindow?.id ?? null;
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
    const { error: findingsError } = await supabase.from("saas_contract_risk_findings").insert(
      findings.map((finding) => ({
        organization_id: context.organizationId,
        software_id: payload.softwareId,
        contract_term_id: term.id,
        opt_out_window_id: optOutWindowId,
        finding_type: finding.findingType,
        severity: finding.severity,
        evidence_json: finding.evidence as Json
      }))
    );

    if (findingsError) throw findingsError;
  }

  revalidatePath("/dashboard/saas-opt-out-clock");
}
