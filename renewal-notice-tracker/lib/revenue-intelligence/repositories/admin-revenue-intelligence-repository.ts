import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  CommercialImpactMetric,
  ExecutiveInsight,
  RevenueForecastScenario,
  RevenueIntelligenceEvidenceLink,
  RevenueIntelligenceSnapshot,
  RevenueRiskSignal,
  VendorCategoryIntelligenceSummary
} from "@/lib/revenue-intelligence/revenue-types";

type UntypedSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

function admin() {
  return createAdminSupabaseClient() as UntypedSupabaseClient;
}

function nowValues(values: Record<string, unknown>) {
  return { ...values, updated_at: new Date().toISOString() };
}

async function upsertActiveByFingerprint<T>(input: {
  table: string;
  organizationId: string;
  sourceFingerprint: string;
  insertValues: Record<string, unknown>;
  updateValues: Record<string, unknown>;
}): Promise<{ data: T | null; error: Error | null }> {
  const existing = (await admin()
    .from(input.table)
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("source_fingerprint", input.sourceFingerprint)
    .eq("status", "active")
    .maybeSingle()) as unknown as { data: T | null; error: Error | null };
  if (existing.error) return existing;

  if (existing.data && typeof existing.data === "object" && "id" in existing.data) {
    return admin()
      .from(input.table)
      .update(nowValues(input.updateValues) as never)
      .eq("organization_id", input.organizationId)
      .eq("id", (existing.data as { id: string }).id)
      .select("*")
      .single() as unknown as Promise<{ data: T | null; error: Error | null }>;
  }

  return admin()
    .from(input.table)
    .insert({
      organization_id: input.organizationId,
      source_fingerprint: input.sourceFingerprint,
      ...input.insertValues
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: T | null; error: Error | null }>;
}

export async function createRevenueIntelligenceSnapshot(input: {
  organizationId: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return admin()
    .from("revenue_intelligence_snapshots")
    .insert({
      organization_id: input.organizationId,
      created_by_user_id: input.createdByUserId ?? null,
      ...input.values
    } as never)
    .select("*")
    .single() as unknown as Promise<{ data: RevenueIntelligenceSnapshot | null; error: Error | null }>;
}

export async function getRevenueIntelligenceSnapshotById(input: {
  organizationId: string;
  snapshotId: string;
}) {
  return admin()
    .from("revenue_intelligence_snapshots")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.snapshotId)
    .maybeSingle() as unknown as Promise<{ data: RevenueIntelligenceSnapshot | null; error: Error | null }>;
}

export async function getLatestRevenueIntelligenceSnapshot(input: { organizationId: string }) {
  return admin()
    .from("revenue_intelligence_snapshots")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as Promise<{ data: RevenueIntelligenceSnapshot | null; error: Error | null }>;
}

export async function listRevenueIntelligenceSnapshots(input: {
  organizationId: string;
  limit?: number;
}) {
  return admin()
    .from("revenue_intelligence_snapshots")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25) as unknown as Promise<{ data: RevenueIntelligenceSnapshot[] | null; error: Error | null }>;
}

export function createOrUpdateRevenueRiskSignal(input: {
  organizationId: string;
  sourceFingerprint: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return upsertActiveByFingerprint<RevenueRiskSignal>({
    table: "revenue_risk_signals",
    organizationId: input.organizationId,
    sourceFingerprint: input.sourceFingerprint,
    insertValues: { created_by_user_id: input.createdByUserId ?? null, ...input.values },
    updateValues: input.values
  });
}

export async function listRevenueRiskSignals(input: {
  organizationId: string;
  snapshotId?: string;
  status?: string;
  limit?: number;
}) {
  let query = admin()
    .from("revenue_risk_signals")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (input.snapshotId) query = query.eq("snapshot_id", input.snapshotId);
  if (input.status) query = query.eq("status", input.status);
  return query as unknown as Promise<{ data: RevenueRiskSignal[] | null; error: Error | null }>;
}

export async function archiveRevenueRiskSignal(input: {
  organizationId: string;
  signalId: string;
}) {
  return admin()
    .from("revenue_risk_signals")
    .update(nowValues({ status: "archived" }) as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.signalId)
    .select("*")
    .single() as unknown as Promise<{ data: RevenueRiskSignal | null; error: Error | null }>;
}

export function createOrUpdateCommercialImpactMetric(input: {
  organizationId: string;
  sourceFingerprint: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return upsertActiveByFingerprint<CommercialImpactMetric>({
    table: "commercial_impact_metrics",
    organizationId: input.organizationId,
    sourceFingerprint: input.sourceFingerprint,
    insertValues: { created_by_user_id: input.createdByUserId ?? null, ...input.values },
    updateValues: input.values
  });
}

export async function listCommercialImpactMetrics(input: {
  organizationId: string;
  snapshotId?: string;
  status?: string;
  limit?: number;
}) {
  let query = admin()
    .from("commercial_impact_metrics")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (input.snapshotId) query = query.eq("snapshot_id", input.snapshotId);
  if (input.status) query = query.eq("status", input.status);
  return query as unknown as Promise<{ data: CommercialImpactMetric[] | null; error: Error | null }>;
}

export function createOrUpdateVendorCategorySummary(input: {
  organizationId: string;
  sourceFingerprint: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return upsertActiveByFingerprint<VendorCategoryIntelligenceSummary>({
    table: "vendor_category_intelligence_summaries",
    organizationId: input.organizationId,
    sourceFingerprint: input.sourceFingerprint,
    insertValues: { created_by_user_id: input.createdByUserId ?? null, ...input.values },
    updateValues: input.values
  });
}

export async function listVendorCategorySummaries(input: {
  organizationId: string;
  snapshotId?: string;
  status?: string;
  limit?: number;
}) {
  let query = admin()
    .from("vendor_category_intelligence_summaries")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("renewal_value", { ascending: false })
    .limit(input.limit ?? 50);
  if (input.snapshotId) query = query.eq("snapshot_id", input.snapshotId);
  if (input.status) query = query.eq("status", input.status);
  return query as unknown as Promise<{ data: VendorCategoryIntelligenceSummary[] | null; error: Error | null }>;
}

export function createOrUpdateRevenueForecastScenario(input: {
  organizationId: string;
  sourceFingerprint: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return upsertActiveByFingerprint<RevenueForecastScenario>({
    table: "revenue_forecast_scenarios",
    organizationId: input.organizationId,
    sourceFingerprint: input.sourceFingerprint,
    insertValues: { created_by_user_id: input.createdByUserId ?? null, ...input.values },
    updateValues: input.values
  });
}

export async function listRevenueForecastScenarios(input: {
  organizationId: string;
  snapshotId?: string;
  status?: string;
}) {
  let query = admin()
    .from("revenue_forecast_scenarios")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("scenario", { ascending: true });
  if (input.snapshotId) query = query.eq("snapshot_id", input.snapshotId);
  if (input.status) query = query.eq("status", input.status);
  return query as unknown as Promise<{ data: RevenueForecastScenario[] | null; error: Error | null }>;
}

export function createOrUpdateExecutiveInsight(input: {
  organizationId: string;
  sourceFingerprint: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return upsertActiveByFingerprint<ExecutiveInsight>({
    table: "executive_insights",
    organizationId: input.organizationId,
    sourceFingerprint: input.sourceFingerprint,
    insertValues: { created_by_user_id: input.createdByUserId ?? null, ...input.values },
    updateValues: input.values
  });
}

export async function listExecutiveInsights(input: {
  organizationId: string;
  snapshotId?: string;
  status?: string;
  limit?: number;
}) {
  let query = admin()
    .from("executive_insights")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);
  if (input.snapshotId) query = query.eq("snapshot_id", input.snapshotId);
  if (input.status) query = query.eq("status", input.status);
  return query as unknown as Promise<{ data: ExecutiveInsight[] | null; error: Error | null }>;
}

export async function markExecutiveInsightReviewed(input: {
  organizationId: string;
  insightId: string;
  actorUserId: string;
}) {
  return admin()
    .from("executive_insights")
    .update(nowValues({
      reviewed: true,
      reviewed_by_user_id: input.actorUserId,
      reviewed_at: new Date().toISOString(),
      status: "reviewed"
    }) as never)
    .eq("organization_id", input.organizationId)
    .eq("id", input.insightId)
    .select("*")
    .single() as unknown as Promise<{ data: ExecutiveInsight | null; error: Error | null }>;
}

export function createOrUpdateRevenueEvidenceLink(input: {
  organizationId: string;
  sourceFingerprint: string;
  createdByUserId?: string | null;
  values: Record<string, unknown>;
}) {
  return upsertActiveByFingerprint<RevenueIntelligenceEvidenceLink>({
    table: "revenue_intelligence_evidence_links",
    organizationId: input.organizationId,
    sourceFingerprint: input.sourceFingerprint,
    insertValues: { created_by_user_id: input.createdByUserId ?? null, ...input.values },
    updateValues: input.values
  });
}

export async function listRevenueEvidenceLinks(input: {
  organizationId: string;
  snapshotId?: string;
  status?: string;
  limit?: number;
}) {
  let query = admin()
    .from("revenue_intelligence_evidence_links")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 200);
  if (input.snapshotId) query = query.eq("snapshot_id", input.snapshotId);
  if (input.status) query = query.eq("status", input.status);
  return query as unknown as Promise<{ data: RevenueIntelligenceEvidenceLink[] | null; error: Error | null }>;
}

export async function archiveStaleRevenueSignals(input: {
  organizationId: string;
  activeFingerprints: string[];
}) {
  const existing = await admin()
    .from("revenue_risk_signals")
    .select("id, source_fingerprint")
    .eq("organization_id", input.organizationId)
    .eq("status", "active") as unknown as {
      data: Array<{ id: string; source_fingerprint: string }> | null;
      error: Error | null;
    };
  if (existing.error) return { data: null, error: existing.error };

  const active = new Set(input.activeFingerprints);
  const staleIds = (existing.data ?? [])
    .filter((row) => !active.has(row.source_fingerprint))
    .map((row) => row.id);
  if (!staleIds.length) return { data: [], error: null };

  const archived: Array<{ id: string }> = [];
  for (const signalId of staleIds) {
    const result = await admin()
      .from("revenue_risk_signals")
      .update(nowValues({ status: "archived" }) as never)
      .eq("organization_id", input.organizationId)
      .eq("id", signalId)
      .select("id")
      .single() as unknown as { data: { id: string } | null; error: Error | null };
    if (result.error) return { data: null, error: result.error };
    if (result.data) archived.push(result.data);
  }

  return { data: archived, error: null };
}
