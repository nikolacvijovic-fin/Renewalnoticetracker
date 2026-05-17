import { z } from "zod";
import {
  CONTRACT_STATUS_TAGS,
  LOW_CONFIDENCE_THRESHOLD,
  RENEWAL_DECISION_STATUSES
} from "@/lib/constants";
import {
  PHASE1_P0_FIELDS,
  PHASE1_REVIEW_MODES,
  getPhase1ReviewDirtyFlags,
  getPhase1ReviewMode,
  requiresReviewReason
} from "@/lib/contracts/phase1-pilot";
import { INTELLIGENCE_TRUST_LEVELS } from "@/lib/intelligence/shared/types";
import { splitEmails } from "@/lib/utils";
import { isValidReminderOffset } from "@/lib/contracts/templates";

export const extractedFieldSchema = z.object({
  contract_title: z.string().nullable(),
  counterparty_name: z.string().nullable(),
  contract_type: z.string().nullable(),
  effective_date: z.string().nullable(),
  renewal_date: z.string().nullable().default(null),
  expiration_date: z.string().nullable(),
  auto_renewal: z.boolean().nullable(),
  renewal_term: z.string().nullable(),
  notice_period_value: z.number().int().nullable(),
  notice_period_unit: z.enum(["days", "weeks", "months"]).nullable(),
  notice_deadline_date: z.string().nullable(),
  termination_window: z.string().nullable().default(null),
  governing_law: z.string().nullable(),
  payment_terms: z.string().nullable(),
  contract_value_amount: z.number().nullable().default(null),
  contract_value_currency: z.string().nullable().default(null),
  contract_value_period: z.string().nullable().default(null),
  price_change_trigger: z.string().nullable().default(null),
  payment_trigger: z.string().nullable().default(null),
  financial_data_trust_status: z.enum(INTELLIGENCE_TRUST_LEVELS).nullable().default(null),
  extracted_clauses: z.array(z.string()).default([]),
  field_confidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  field_source_snippets: z.record(z.string(), z.string()).default({}),
  reminder_recommendations: z.array(z.string()).default([]),
  reviewer_notes: z.string().nullable().default(null)
});

export type ExtractedContractFields = z.infer<typeof extractedFieldSchema>;

export const uploadContractSchema = z.object({
  contractTitle: z.string().min(2),
  fileName: z.string().min(1),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]),
  sizeBytes: z.number().max(15 * 1024 * 1024)
});

const reviewContractShape = extractedFieldSchema.extend({
  needs_review: z.boolean().default(true),
  review_mode: z.enum(PHASE1_REVIEW_MODES).optional(),
  review_reason: z.string().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  department: z.string().nullable().optional(),
  status_tag: z.enum(CONTRACT_STATUS_TAGS).default("active"),
  counterparty_id: z.string().uuid().nullable().optional(),
  contract_template_key: z.string().nullable().optional(),
  renewal_decision_status: z.enum(RENEWAL_DECISION_STATUSES).default("undecided"),
  renewal_decision_date: z.string().nullable().optional(),
  has_conflict: z.boolean().default(false),
  has_derived_date: z.boolean().default(false),
  has_weak_evidence: z.boolean().default(false),
  is_ocr_assisted: z.boolean().default(false),
  is_manual_without_evidence: z.boolean().default(false),
  changes_previously_verified_p0: z.boolean().default(false),
  accepted_unverified_risk_requested: z.boolean().default(false)
});

export const reviewContractSchema = reviewContractShape.superRefine((value, ctx) => {
  const reviewMode = value.review_mode ?? getPhase1ReviewMode(value);
  const dirtyFlags = getPhase1ReviewDirtyFlags(value);

  if (!value.needs_review && !value.notice_deadline_date && !value.renewal_date && !value.expiration_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A reviewed contract needs a notice deadline, renewal date, or expiration date before review can complete.",
      path: ["expiration_date"]
    });
  }

  if (
    reviewMode === "fast_review" &&
    Object.values(dirtyFlags).some(Boolean)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fast Review is only allowed when no dirty review flags are present.",
      path: ["review_mode"]
    });
  }

  if (!requiresReviewReason({
    reviewMode,
    needsReview: value.needs_review,
    reviewReason: value.review_reason ?? null
  })) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Exception review requires a typed reason so reminder trust changes are auditable.",
      path: ["review_reason"]
    });
  }
  });

export const manualContractSchema = reviewContractShape.extend({
  contract_title: z.string().min(2),
  source_type: z.literal("manual").default("manual")
});

export const exportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  filter: z.string().optional()
});

export const counterpartySchema = z.object({
  name: z.string().min(2)
});

export const templateSchema = z.object({
  template_key: z.string().min(2),
  name: z.string().min(2),
  contract_type: z.string().nullable().optional(),
  default_notice_period_value: z.number().int().nullable().optional(),
  default_notice_period_unit: z.enum(["days", "weeks", "months"]).nullable().optional(),
  default_reminder_offsets: z.array(z.string()).default(["P30D", "P14D", "P3D"]),
  checklist: z.array(z.string()).default([])
});

export const renewalDecisionSchema = z.object({
  status: z.enum(RENEWAL_DECISION_STATUSES),
  decision_date: z.string().nullable().optional(),
  summary: z.string().min(3),
  next_steps: z.array(z.string()).default([])
});

export const playbookSchema = z.object({
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  steps: z.array(z.string()).min(1)
});

export const playbookRunSchema = z.object({
  playbook_id: z.string().uuid(),
  selected_steps: z.array(z.string()).default([])
});

export const reminderRuleSchema = z.object({
  rule_name: z.string().min(2),
  offsets: z
    .array(z.string())
    .min(1)
    .refine((values) => values.every((value) => isValidReminderOffset(value)), {
      message: "Offsets must be ISO period offsets like -P45D or P2W."
    }),
  escalation_recipients: z.array(z.string().email()).default([]),
  escalation_delay_days: z.number().int().min(0).default(2)
});

export const recipientListSchema = z
  .string()
  .transform(splitEmails)
  .refine((emails) => emails.length > 0, "At least one recipient is required.");

export function computeNeedsReview(payload: ExtractedContractFields) {
  const fields = [...PHASE1_P0_FIELDS] as const;

  return fields.some((field) => {
    const confidence = payload.field_confidence[field] ?? 0;
    const value =
      field === "auto_renewal"
        ? payload.auto_renewal
        : payload[field as Exclude<typeof field, "auto_renewal">];

    return value === null || value === undefined || confidence < LOW_CONFIDENCE_THRESHOLD;
  });
}
