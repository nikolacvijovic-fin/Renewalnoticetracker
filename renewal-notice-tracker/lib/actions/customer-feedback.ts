"use server";

import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { requireInternalRole } from "@/lib/internal-access";
import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import { emitOperationalEvent } from "@/lib/observability/monitoring";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildCustomerFeedbackEventMetadata,
  buildCustomerFeedbackInsert,
  buildCustomerFeedbackReference,
  eventNameForFeedbackStatus,
  isCustomerFeedbackStatus,
  sanitizeCustomerFeedbackMessage,
  type CustomerFeedbackReference,
  type CustomerFeedbackSeverity,
  type CustomerFeedbackStatus,
  type CustomerFeedbackType
} from "@/lib/customer-feedback/customer-feedback";
import {
  getCustomerFeedbackByIdForInternalStatusChange,
  updateCustomerFeedbackStatusAsInternal
} from "@/lib/internal/repositories/admin-beta-reliability-repository";

type UntypedSupabaseClient = {
  from: (table: string) => {
    insert: (payload: unknown) => {
      select: (columns: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { code?: string; message?: string } | null }>;
      };
    };
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          limit: (count: number) => Promise<{
            data: Array<{ id: string; feedback_type: string; status: string; created_at: string }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
    update: (payload: unknown) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => Promise<{ data: unknown | null; error: { message?: string } | null }>;
      };
    };
  };
};

type FeedbackRow = {
  id: string;
  organization_id: string;
  feedback_type: string;
  severity: string;
  status: string;
  entity_type: string | null;
  entity_id: string | null;
};

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalStringValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value || null;
}

function customerFeedbackPath(fallback?: string | null) {
  if (fallback?.startsWith("/dashboard")) return fallback;
  return "/dashboard";
}

function getSafeContextFromForm(formData: FormData) {
  return {
    currentRoute: optionalStringValue(formData, "current_route"),
    contractId: optionalStringValue(formData, "contract_id"),
    fieldName: optionalStringValue(formData, "field_name"),
    reviewStatus: optionalStringValue(formData, "review_status"),
    deadlineWindow: optionalStringValue(formData, "deadline_window"),
    exportType: optionalStringValue(formData, "export_type"),
    reminderType: optionalStringValue(formData, "reminder_type"),
    decisionStatus: optionalStringValue(formData, "decision_status"),
    sourceSurface: optionalStringValue(formData, "source_surface"),
    entityType: optionalStringValue(formData, "entity_type"),
    entityId: optionalStringValue(formData, "entity_id")
  };
}

function shouldAlertOnFeedback(feedbackType: CustomerFeedbackType, severity: CustomerFeedbackSeverity) {
  return (
    feedbackType === "deadline_incorrect" ||
    feedbackType === "request_help" ||
    severity === "high" ||
    severity === "urgent"
  );
}

async function findExistingFeedbackReference(
  supabase: UntypedSupabaseClient,
  input: { organizationId: string; idempotencyKey: string }
): Promise<CustomerFeedbackReference | null> {
  const { data, error } = await supabase
    .from("customer_feedback")
    .select("id,feedback_type,status,created_at")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .limit(1);
  if (error) throw new Error(error.message ?? "customer_feedback_duplicate_lookup_failed");
  const row = data?.[0] ?? null;
  return row
    ? buildCustomerFeedbackReference({
        id: row.id,
        feedbackType: row.feedback_type,
        status: row.status,
        createdAt: row.created_at,
        duplicate: true
      })
    : null;
}

export async function submitCustomerFeedbackFormAction(formData: FormData): Promise<CustomerFeedbackReference | void> {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "submit_feedback");
  const contractId = optionalStringValue(formData, "contract_id");
  if (contractId) {
    await requireScopedContract(contractId, context.organizationId);
  }

  const payload = buildCustomerFeedbackInsert({
    organizationId: context.organizationId,
    submittedByUserId: context.user.id,
    contractId,
    entityType: optionalStringValue(formData, "entity_type"),
    entityId: optionalStringValue(formData, "entity_id"),
    feedbackType: stringValue(formData, "feedback_type") as CustomerFeedbackType,
    severity: (stringValue(formData, "severity") || "medium") as CustomerFeedbackSeverity,
    message: stringValue(formData, "message"),
    safeContext: getSafeContextFromForm(formData)
  });

  const supabase = createServerSupabaseClient() as unknown as UntypedSupabaseClient;
  const { data, error } = await supabase.from("customer_feedback").insert(payload).select("id").single();
  if (error || !data?.id) {
    if (error?.code === "23505") {
      revalidatePath(customerFeedbackPath(optionalStringValue(formData, "current_route")));
      if (contractId) revalidatePath(`/dashboard/contracts/${contractId}`);
      return (await findExistingFeedbackReference(supabase, {
        organizationId: context.organizationId,
        idempotencyKey: payload.idempotency_key
      })) ?? undefined;
    }
    throw new Error(error?.message ?? "customer_feedback_submit_failed");
  }

  const baseMetadata = buildCustomerFeedbackEventMetadata({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feedbackId: data.id,
    toStatus: "open",
    feedbackType: payload.feedback_type,
    severity: payload.severity,
    entityType: payload.entity_type,
    entityId: payload.entity_id
  });

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      contractId,
      action: "feedback.submitted",
      entityType: "customer_feedback",
      entityId: data.id,
      details: baseMetadata
    },
    { mode: "best_effort" }
  );

  if (payload.feedback_type === "deadline_correct" || payload.feedback_type === "deadline_incorrect") {
    await createAuditLog(
      {
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        contractId,
        action: "feedback.deadline_correctness_recorded",
        entityType: "customer_feedback",
        entityId: data.id,
        details: {
          ...baseMetadata,
          deadlineCorrect: payload.feedback_type === "deadline_correct"
        }
      },
      { mode: "best_effort" }
    );
  }

  const analyticsProperties = {
    feedback_type: payload.feedback_type,
    severity: payload.severity,
    status: payload.status,
    has_contract: Boolean(contractId),
    source_surface: payload.safe_context.sourceSurface ?? null
  };

  if (payload.feedback_type === "deadline_correct" || payload.feedback_type === "deadline_incorrect") {
    await trackServerAnalyticsEvent({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      eventName: "deadline_correctness_recorded",
      sourceOfTruth: "event",
      idempotencyKey: payload.idempotency_key,
      properties: analyticsProperties
    }).catch(() => undefined);
  } else {
    await trackServerAnalyticsEvent({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      eventName: "customer_feedback_submitted",
      sourceOfTruth: "event",
      idempotencyKey: payload.idempotency_key,
      properties: analyticsProperties
    }).catch(() => undefined);
  }

  await emitOperationalEvent({
    eventName: "customer_feedback_submitted_monitoring",
    severity: shouldAlertOnFeedback(payload.feedback_type, payload.severity) ? "P2" : "P3",
    sensitivity: "customer_sensitive",
    alert: shouldAlertOnFeedback(payload.feedback_type, payload.severity),
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "submit_feedback",
    route: optionalStringValue(formData, "current_route"),
    metadata: {
      feedbackId: data.id,
      feedbackType: payload.feedback_type,
      severity: payload.severity,
      status: payload.status,
      contractId,
      entityType: payload.entity_type,
      entityId: payload.entity_id,
      sourceSurface: payload.safe_context.sourceSurface ?? null
    }
  }).catch(() => undefined);

  revalidatePath(customerFeedbackPath(optionalStringValue(formData, "current_route")));
  if (contractId) revalidatePath(`/dashboard/contracts/${contractId}`);
  revalidatePath("/admin/beta-health");

  return buildCustomerFeedbackReference({
    id: data.id,
    feedbackType: payload.feedback_type,
    status: payload.status
  });
}

export async function updateCustomerFeedbackStatusFormAction(formData: FormData) {
  const feedbackId = stringValue(formData, "feedback_id");
  const organizationId = stringValue(formData, "organization_id");
  const nextStatus = stringValue(formData, "status");
  const resolutionNote = sanitizeCustomerFeedbackMessage(stringValue(formData, "resolution_note"));

  if (!feedbackId) throw new Error("feedback_id_required");
  if (!organizationId) throw new Error("organization_id_required");
  if (!isCustomerFeedbackStatus(nextStatus)) throw new Error("feedback_status_invalid");

  const internal = await requireInternalRole(["internal_admin", "internal_support"]);
  const actorUserId = internal.user.id;
  const previous = await getCustomerFeedbackByIdForInternalStatusChange(feedbackId, organizationId);
  await updateCustomerFeedbackStatusAsInternal({
    feedbackId,
    organizationId,
    status: nextStatus,
    resolvedByUserId: nextStatus === "resolved" || nextStatus === "dismissed" ? actorUserId : null,
    resolutionNote
  });

  const action = eventNameForFeedbackStatus(nextStatus as CustomerFeedbackStatus);
  await createAuditLog(
    {
      organizationId,
      actorUserId,
      action,
      entityType: "customer_feedback",
      entityId: feedbackId,
      details: buildCustomerFeedbackEventMetadata({
        organizationId,
        actorUserId,
        feedbackId,
        fromStatus: previous.status as CustomerFeedbackStatus,
        toStatus: nextStatus as CustomerFeedbackStatus,
        feedbackType: previous.feedback_type,
        severity: previous.severity,
        entityType: previous.entity_type,
        entityId: previous.entity_id
      })
    },
    { mode: "best_effort" }
  );

  if (nextStatus === "resolved") {
    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId,
      eventName: "customer_feedback_resolved",
      sourceOfTruth: "event",
      idempotencyKey: `customer_feedback_resolved:${feedbackId}:${actorUserId}`,
      properties: {
        feedback_type: previous.feedback_type,
        severity: previous.severity,
        from_status: previous.status,
        to_status: nextStatus
      }
    }).catch(() => undefined);
  }

  await emitOperationalEvent({
    eventName: "customer_feedback_status_changed",
    severity: nextStatus === "resolved" ? "P3" : "P2",
    sensitivity: "customer_sensitive",
    alert: nextStatus !== "resolved",
    organizationId,
    actorUserId,
    action,
    metadata: {
      feedbackId,
      feedbackType: previous.feedback_type,
      severity: previous.severity,
      fromStatus: previous.status,
      toStatus: nextStatus
    }
  }).catch(() => undefined);

  revalidatePath("/admin/beta-health");
  revalidatePath("/dashboard");
}
