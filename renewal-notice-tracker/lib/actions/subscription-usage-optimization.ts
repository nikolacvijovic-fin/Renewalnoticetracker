"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { enforceFeatureAccess, getBillingSnapshot } from "@/lib/billing/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reconcileUsage } from "@/lib/add-ons/python-intelligence-client";
import { evaluateSubscriptionUsageOptimizationAccess } from "@/lib/subscription-usage/access";
import {
  assessSubscriptionUsageRows,
  buildSubscriptionUsageImportIdempotencyKey,
  parseSubscriptionUsageImportFile
} from "@/lib/subscription-usage/usage-import";
import { sanitizeSubscriptionUsageAuditMetadata } from "@/lib/subscription-usage/findings";
import type { SubscriptionUsageImportAssessment } from "@/lib/subscription-usage/types";

const MAX_USAGE_IMPORT_ROWS = 1000;

type SubscriptionUsageRowRecord = {
  id: string;
  vendor_name: string | null;
  product_name: string | null;
  normalized_product: string | null;
  product_category: string | null;
  annual_reviewed_cost: number | null;
  currency: string | null;
  purchased_seats: number | null;
  assigned_seats: number | null;
  active_users_30d: number | null;
  active_users_90d: number | null;
  last_activity_at: string | null;
  collected_at: string | null;
  trust_state: string | null;
  confidence: number | null;
  is_sample: boolean | null;
};

type SubscriptionUsageQueryResult<T> = {
  data: T;
  error: unknown | null;
};

type SubscriptionUsageRowsSelectQuery = {
  eq(column: string, value: string): SubscriptionUsageRowsSelectQuery;
  in(column: string, values: string[]): SubscriptionUsageRowsSelectQuery;
  limit(count: number): Promise<SubscriptionUsageQueryResult<SubscriptionUsageRowRecord[] | null>>;
};

type SubscriptionUsageSupabaseClient = {
  from(table: "usage_import_batches"): {
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<SubscriptionUsageQueryResult<{ id: string } | null>>;
      };
    };
  };
  from(table: "usage_import_rows"): {
    insert(values: Array<Record<string, unknown>>): Promise<SubscriptionUsageQueryResult<null>>;
    select(columns: string): SubscriptionUsageRowsSelectQuery;
  };
};

export type SubscriptionUsageImportPreview = {
  assessment: SubscriptionUsageImportAssessment;
  idempotencyKey: string;
};

async function assertSubscriptionUsageOptimizationReady(organizationId: string) {
  const access = await evaluateSubscriptionUsageOptimizationAccess(await getBillingSnapshot(organizationId));
  if (!access.allowed) {
    throw new Error(access.customerSafeMessage);
  }
}

function createSubscriptionUsageSupabaseClient() {
  return createServerSupabaseClient() as unknown as SubscriptionUsageSupabaseClient;
}

export async function previewSubscriptionUsageImportAction(formData: FormData): Promise<SubscriptionUsageImportPreview> {
  const context = await requireOrganization();
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_import_preview" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const file = formData.get("file");
  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  if (!(file instanceof File)) throw new Error("A CSV or XLSX usage file is required.");
  if (!sourceLabel) throw new Error("A source label is required.");

  const rows = parseSubscriptionUsageImportFile(file.name, Buffer.from(await file.arrayBuffer()));
  if (rows.length > MAX_USAGE_IMPORT_ROWS) {
    throw new Error(`Usage imports are limited to ${MAX_USAGE_IMPORT_ROWS} rows in the starter workflow.`);
  }

  const assessment = assessSubscriptionUsageRows(rows, { sourceLabel });
  const idempotencyKey = buildSubscriptionUsageImportIdempotencyKey({
    organizationId: context.organizationId,
    fileName: file.name,
    rowHashes: assessment.rows.map((row) => row.normalized.sourceRowHash)
  });

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.import_previewed",
      entityType: "subscription_usage_import_batch",
      details: sanitizeSubscriptionUsageAuditMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        issueCodes: [...new Set(assessment.rows.flatMap((row) => row.issues.map((issue) => issue.code)))]
      })
    },
    { mode: "best_effort" }
  );

  return { assessment, idempotencyKey };
}

export async function commitSubscriptionUsageImportAction(formData: FormData) {
  const context = await requireOrganization();
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_import_commit" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const file = formData.get("file");
  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  if (!(file instanceof File)) throw new Error("A CSV or XLSX usage file is required.");
  if (!sourceLabel) throw new Error("A source label is required.");

  const rows = parseSubscriptionUsageImportFile(file.name, Buffer.from(await file.arrayBuffer()));
  if (rows.length > MAX_USAGE_IMPORT_ROWS) throw new Error(`Usage imports are limited to ${MAX_USAGE_IMPORT_ROWS} rows.`);

  const assessment = assessSubscriptionUsageRows(rows, { sourceLabel });
  const idempotencyKey = buildSubscriptionUsageImportIdempotencyKey({
    organizationId: context.organizationId,
    fileName: file.name,
    rowHashes: assessment.rows.map((row) => row.normalized.sourceRowHash)
  });

  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: batch, error: batchError } = await supabase
    .from("usage_import_batches")
    .insert({
      organization_id: context.organizationId,
      actor_user_id: context.user.id,
      source: sourceLabel,
      status: assessment.summary.rejectedCount > 0 ? "completed" : "completed",
      row_count: assessment.summary.totalRows,
      error_count: assessment.summary.rejectedCount,
      ready_count: assessment.summary.readyCount,
      rejected_count: assessment.summary.rejectedCount,
      partial_success: assessment.summary.partialSuccess,
      file_name: file.name,
      idempotency_key: idempotencyKey,
      metadata: {
        templateVersion: "subscription_usage_v1",
        needsReviewCount: assessment.summary.needsReviewCount,
        duplicateCount: assessment.summary.duplicateCount,
        sampleCount: assessment.summary.sampleCount
      },
      committed_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  if (!batch?.id) throw new Error("Unable to persist subscription usage import batch.");

  const batchId = String(batch.id);
  const insertRows = assessment.rows.map((row) => ({
    organization_id: context.organizationId,
    batch_id: batchId,
    row_number: row.rowNumber,
    vendor_name: row.normalized.vendor,
    product_name: row.normalized.product,
    normalized_product: row.normalized.normalizedProduct,
    product_category: row.normalized.category,
    seats_purchased: row.normalized.purchasedSeats,
    seats_used: row.normalized.activeUsers30d,
    spend_amount: row.normalized.annualCost,
    currency: row.normalized.currency,
    annual_reviewed_cost: row.normalized.annualCost,
    purchased_seats: row.normalized.purchasedSeats,
    assigned_seats: row.normalized.assignedSeats,
    active_users_30d: row.normalized.activeUsers30d,
    active_users_90d: row.normalized.activeUsers90d,
    last_activity_at: row.normalized.lastActivityAt,
    department: row.normalized.department,
    owner_label: row.normalized.owner,
    contract_reference: row.normalized.contractReference,
    source_label: row.normalized.sourceLabel,
    collected_at: row.normalized.collectedAt,
    trust_state: row.normalized.trustState,
    confidence: row.normalized.confidence,
    validation_status: row.status,
    issue_codes: row.issues.map((issue) => issue.code),
    source_row_hash: row.normalized.sourceRowHash,
    is_sample: row.normalized.isSample,
    normalized_payload: {
      category: row.normalized.category,
      department: row.normalized.department,
      contractReference: row.normalized.contractReference
    }
  }));

  const { error: rowError } = await supabase.from("usage_import_rows").insert(insertRows);
  if (rowError) throw rowError;

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.import_committed",
      entityType: "subscription_usage_import_batch",
      entityId: batchId,
      details: sanitizeSubscriptionUsageAuditMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        batchId,
        issueCodes: [...new Set(assessment.rows.flatMap((row) => row.issues.map((issue) => issue.code)))]
      })
    },
    { mode: "best_effort" }
  );

  revalidatePath("/dashboard/subscription-optimization");
  return { batchId, assessment };
}

export async function runSubscriptionUsageReconciliationAction(batchId: string) {
  const context = await requireOrganization();
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_reconciliation" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: rows, error } = await supabase
    .from("usage_import_rows")
    .select("id, vendor_name, product_name, normalized_product, product_category, annual_reviewed_cost, currency, purchased_seats, assigned_seats, active_users_30d, active_users_90d, last_activity_at, collected_at, trust_state, confidence, is_sample")
    .eq("organization_id", context.organizationId)
    .eq("batch_id", batchId)
    .in("validation_status", ["ready", "needs_review"])
    .limit(MAX_USAGE_IMPORT_ROWS);

  if (error) throw error;

  const result = await reconcileUsage({
    organization_id: context.organizationId,
    usage_import_batch_id: batchId,
    matching_mode: "balanced",
    normalized_rows: (rows ?? []).map((row) => ({
      usage_row_id: row.id,
      vendor: row.vendor_name ?? "",
      product: row.product_name ?? "",
      normalized_product: row.normalized_product ?? "",
      category: row.product_category ?? null,
      annual_reviewed_cost: row.annual_reviewed_cost ?? null,
      currency: row.currency ?? null,
      purchased_seats: row.purchased_seats ?? null,
      assigned_seats: row.assigned_seats ?? null,
      active_users_30d: row.active_users_30d ?? null,
      active_users_90d: row.active_users_90d ?? null,
      last_activity_at: row.last_activity_at ?? null,
      collected_at: row.collected_at ?? null,
      trust_state: row.trust_state ?? null,
      confidence: row.confidence ?? null,
      is_sample: row.is_sample ?? false
    })),
    contract_candidates: []
  });

  if (!result.ok) return result;

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.reconciliation_completed",
      entityType: "subscription_usage_import_batch",
      entityId: batchId,
      details: sanitizeSubscriptionUsageAuditMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        batchId,
        estimatedSavings: result.output.estimated_savings
      })
    },
    { mode: "best_effort" }
  );

  return result;
}
