import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  normalizeEnterpriseAuditEvent,
  type EnterpriseAuditEvent,
  type EnterpriseAuditEventCategory,
  type EnterpriseAuditEventSource,
  type EnterpriseAuditSeverity,
  type EnterpriseAuditSourceRow
} from "@/lib/enterprise-audit/audit-event-model";

export const ENTERPRISE_AUDIT_DEFAULT_LIMIT = 50;
export const ENTERPRISE_AUDIT_LIMIT_CAP = 250;

export type EnterpriseAuditQueryFilters = {
  organizationId: string;
  contractId?: string | null;
  actorUserId?: string | null;
  category?: EnterpriseAuditEventCategory | null;
  severity?: EnterpriseAuditSeverity | null;
  trustSensitiveOnly?: boolean;
  securitySensitiveOnly?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number | null;
  limit?: number | null;
};

export type EnterpriseAuditQueryResult = {
  events: EnterpriseAuditEvent[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type EnterpriseAuditCountsResult<T extends string> = {
  counts: Record<T, number>;
  isPartial: boolean;
  sampleLimit: number;
};

const SOURCES: EnterpriseAuditEventSource[] = [
  "audit_logs",
  "contract_audit_events",
  "trusted_reminder_gate_events",
  "trust_exception_approval_events",
  "renewal_decision_events",
  "organization_activation_events"
];

type UntypedSupabaseClient = {
  from(table: string): {
    select(columns?: string): unknown;
  };
};

type QueryBuilder = {
  eq(column: string, value: string): QueryBuilder;
  gte(column: string, value: string): QueryBuilder;
  lte(column: string, value: string): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(value: number): Promise<{ data: EnterpriseAuditSourceRow[] | null; error: Error | null }>;
  maybeSingle(): Promise<{ data: EnterpriseAuditSourceRow | null; error: Error | null }>;
};

function clampLimit(limit: number | null | undefined) {
  if (!limit || Number.isNaN(limit) || limit < 1) return ENTERPRISE_AUDIT_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), ENTERPRISE_AUDIT_LIMIT_CAP);
}

function normalizePage(page: number | null | undefined) {
  if (!page || Number.isNaN(page) || page < 1) return 1;
  return Math.floor(page);
}

function applySourceFilters(
  query: QueryBuilder,
  filters: EnterpriseAuditQueryFilters,
  source: EnterpriseAuditEventSource,
  sourceLimit: number
) {
  let next = query.eq("organization_id", filters.organizationId);

  if (filters.contractId && source !== "organization_activation_events") {
    next = next.eq("contract_id", filters.contractId);
  }
  if (filters.contractId && source === "organization_activation_events") {
    next = next.eq("contract_id", filters.contractId);
  }
  if (filters.actorUserId) {
    next = next.eq("actor_user_id", filters.actorUserId);
  }
  if (filters.dateFrom) {
    next = next.gte("created_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    next = next.lte("created_at", filters.dateTo);
  }

  return next.order("created_at", { ascending: false }).limit(sourceLimit);
}

async function fetchSourceRows(
  source: EnterpriseAuditEventSource,
  filters: EnterpriseAuditQueryFilters,
  sourceLimit: number
) {
  const supabase = createServerSupabaseClient() as unknown as UntypedSupabaseClient;
  const query = supabase.from(source).select("*") as QueryBuilder;
  const { data, error } = await applySourceFilters(query, filters, source, sourceLimit);
  if (error) throw error;
  return (data ?? []).map((row) => normalizeEnterpriseAuditEvent(row, source));
}

function applyNormalizedFilters(events: EnterpriseAuditEvent[], filters: EnterpriseAuditQueryFilters) {
  return events.filter((event) => {
    if (filters.category && event.eventCategory !== filters.category) return false;
    if (filters.severity && event.severity !== filters.severity) return false;
    if (filters.trustSensitiveOnly && !event.isTrustSensitive) return false;
    if (filters.securitySensitiveOnly && !event.isSecuritySensitive) return false;
    if (filters.contractId && event.contractId !== filters.contractId) return false;
    if (filters.actorUserId && event.actorUserId !== filters.actorUserId) return false;
    return true;
  });
}

export async function getEnterpriseAuditEvents(
  filters: EnterpriseAuditQueryFilters
): Promise<EnterpriseAuditQueryResult> {
  const limit = clampLimit(filters.limit);
  const page = normalizePage(filters.page);
  const sourceLimit = Math.min(ENTERPRISE_AUDIT_LIMIT_CAP, limit * page + limit);
  const rowsBySource = await Promise.all(
    SOURCES.map((source) => fetchSourceRows(source, filters, sourceLimit))
  );
  const merged = applyNormalizedFilters(rowsBySource.flat(), filters).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)
  );
  const offset = (page - 1) * limit;
  const events = merged.slice(offset, offset + limit);

  return {
    events,
    page,
    limit,
    hasMore: merged.length > offset + limit
  };
}

export async function getEnterpriseAuditEventById(input: {
  organizationId: string;
  normalizedEventId: string;
}) {
  const [source, rawId] = input.normalizedEventId.split(":", 2);
  if (!source || !rawId || !SOURCES.includes(source as EnterpriseAuditEventSource)) {
    return null;
  }

  const supabase = createServerSupabaseClient() as unknown as UntypedSupabaseClient;
  const query = supabase.from(source).select("*") as QueryBuilder;
  const { data, error } = await query
    .eq("organization_id", input.organizationId)
    .eq("id", rawId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeEnterpriseAuditEvent(data, source as EnterpriseAuditEventSource) : null;
}

export async function getContractAuditTimeline(input: {
  organizationId: string;
  contractId: string;
  limit?: number;
}) {
  const { events } = await getEnterpriseAuditEvents({
    organizationId: input.organizationId,
    contractId: input.contractId,
    limit: input.limit ?? ENTERPRISE_AUDIT_DEFAULT_LIMIT
  });
  return events.filter(
    (event) =>
      event.isTrustSensitive ||
      event.eventCategory === "evidence" ||
      event.eventCategory === "trusted_reminder" ||
      event.eventCategory === "trust_exception" ||
      event.eventCategory === "renewal_decision" ||
      event.eventType.includes("owner")
  );
}

export async function getTrustSensitiveAuditEvents(filters: EnterpriseAuditQueryFilters) {
  return getEnterpriseAuditEvents({ ...filters, trustSensitiveOnly: true });
}

export async function getSecuritySensitiveAuditEvents(filters: EnterpriseAuditQueryFilters) {
  return getEnterpriseAuditEvents({ ...filters, securitySensitiveOnly: true });
}

export async function getAuditEventCountsByCategory(
  filters: EnterpriseAuditQueryFilters
): Promise<EnterpriseAuditCountsResult<EnterpriseAuditEventCategory>> {
  const { events } = await getEnterpriseAuditEvents({
    ...filters,
    limit: ENTERPRISE_AUDIT_LIMIT_CAP
  });
  const counts = events.reduce<Record<EnterpriseAuditEventCategory, number>>((nextCounts, event) => {
    nextCounts[event.eventCategory] = (nextCounts[event.eventCategory] ?? 0) + 1;
    return nextCounts;
  }, {} as Record<EnterpriseAuditEventCategory, number>);

  return {
    counts,
    isPartial: true,
    sampleLimit: ENTERPRISE_AUDIT_LIMIT_CAP
  };
}

export async function getAuditEventCountsByActor(
  filters: EnterpriseAuditQueryFilters
): Promise<EnterpriseAuditCountsResult<string>> {
  const { events } = await getEnterpriseAuditEvents({
    ...filters,
    limit: ENTERPRISE_AUDIT_LIMIT_CAP
  });
  const counts = events.reduce<Record<string, number>>((nextCounts, event) => {
    const actor = event.actorUserId ?? "system";
    nextCounts[actor] = (nextCounts[actor] ?? 0) + 1;
    return nextCounts;
  }, {});

  return {
    counts,
    isPartial: true,
    sampleLimit: ENTERPRISE_AUDIT_LIMIT_CAP
  };
}
