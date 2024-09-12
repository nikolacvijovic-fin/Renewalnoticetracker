import { Badge } from "@/components/ui/badge";
import { requireInternalRole } from "@/lib/internal-access";
import {
  getAuditEventCountsByCategory,
  getEnterpriseAuditEvents,
  type EnterpriseAuditQueryFilters
} from "@/lib/enterprise-audit/audit-queries";
import type {
  EnterpriseAuditEventCategory,
  EnterpriseAuditSeverity
} from "@/lib/enterprise-audit/audit-event-model";

const CATEGORY_OPTIONS: EnterpriseAuditEventCategory[] = [
  "auth",
  "contract",
  "evidence",
  "trusted_reminder",
  "trust_exception",
  "renewal_decision",
  "import",
  "export",
  "billing",
  "admin",
  "integration",
  "system"
];

const SEVERITY_OPTIONS: EnterpriseAuditSeverity[] = ["info", "warning", "critical"];

function parseCategory(value: string | undefined) {
  return CATEGORY_OPTIONS.includes(value as EnterpriseAuditEventCategory)
    ? (value as EnterpriseAuditEventCategory)
    : null;
}

function parseSeverity(value: string | undefined) {
  return SEVERITY_OPTIONS.includes(value as EnterpriseAuditSeverity)
    ? (value as EnterpriseAuditSeverity)
    : null;
}

function badgeTone(severity: EnterpriseAuditSeverity) {
  if (severity === "critical") return "critical" as const;
  if (severity === "warning") return "warning" as const;
  return "default" as const;
}

function buildFilterLink(
  searchParams: Record<string, string | undefined>,
  next: Record<string, string | null>
) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  Object.entries(next).forEach(([key, value]) => {
    if (value === null) params.delete(key);
    else params.set(key, value);
  });
  return `/admin/audit?${params.toString()}`;
}

export default async function AdminEnterpriseAuditPage({
  searchParams
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  await requireInternalRole(["internal_admin", "internal_support"]);
  const organizationId = searchParams?.organizationId?.trim() ?? "";

  if (!organizationId) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-8">
        <section className="rounded-3xl border border-line bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
            Enterprise governance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Audit control plane</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted">
            Add an explicit organizationId query parameter to inspect normalized audit events.
            Internal audit tools never perform broad cross-tenant reads.
          </p>
        </section>
      </main>
    );
  }

  const filters: EnterpriseAuditQueryFilters = {
    organizationId,
    category: parseCategory(searchParams?.category),
    severity: parseSeverity(searchParams?.severity),
    actorUserId: searchParams?.actorUserId?.trim() || null,
    contractId: searchParams?.contractId?.trim() || null,
    dateFrom: searchParams?.dateFrom?.trim() || null,
    dateTo: searchParams?.dateTo?.trim() || null,
    trustSensitiveOnly: searchParams?.trustSensitiveOnly === "true",
    securitySensitiveOnly: searchParams?.securitySensitiveOnly === "true",
    limit: 100
  };
  const [{ events, hasMore }, countsByCategory] = await Promise.all([
    getEnterpriseAuditEvents(filters),
    getAuditEventCountsByCategory({ organizationId })
  ]);
  const safeSearchParams = searchParams ?? {};

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
          Enterprise governance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Audit control plane</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Normalized, redacted view over audit logs, trust exception approvals, trusted reminder
          gates, renewal decisions, activation events, and contract audit events.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {CATEGORY_OPTIONS.map((category) => (
          <a
            key={category}
            href={buildFilterLink(safeSearchParams, { category })}
            className="rounded-2xl border border-line bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              {category.replaceAll("_", " ")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">{countsByCategory.counts[category] ?? 0}</p>
          </a>
        ))}
      </section>
      {countsByCategory.isPartial ? (
        <p className="text-sm text-muted">
          Category counts are partial, based on the latest {countsByCategory.sampleLimit} normalized events. Use the
          event table and filters for investigation until exact aggregate views are available.
        </p>
      ) : null}

      <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <a className="rounded-full border border-line px-3 py-1 text-sm" href={`/admin/audit?organizationId=${organizationId}`}>
            Clear filters
          </a>
          {SEVERITY_OPTIONS.map((severity) => (
            <a
              key={severity}
              className="rounded-full border border-line px-3 py-1 text-sm"
              href={buildFilterLink(safeSearchParams, { severity })}
            >
              {severity}
            </a>
          ))}
          <a
            className="rounded-full border border-line px-3 py-1 text-sm"
            href={buildFilterLink(safeSearchParams, { trustSensitiveOnly: "true" })}
          >
            Trust-sensitive
          </a>
          <a
            className="rounded-full border border-line px-3 py-1 text-sm"
            href={buildFilterLink(safeSearchParams, { securitySensitiveOnly: "true" })}
          >
            Security-sensitive
          </a>
          <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-sm text-muted">
            Export scaffold: JSON/CSV service available
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-muted">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Labels</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-4 py-4 text-xs text-muted">{event.createdAt}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={badgeTone(event.severity)}>{event.severity}</Badge>
                    <Badge>{event.eventCategory.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-2 font-semibold text-ink">{event.summary}</p>
                  <p className="mt-1 text-xs text-muted">{event.eventSource} | {event.eventType}</p>
                </td>
                <td className="px-4 py-4 font-mono text-xs">{event.actorLabel}</td>
                <td className="px-4 py-4 font-mono text-xs">{event.contractId ?? "workspace"}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    {event.isTrustSensitive ? <Badge tone="automation">Trust</Badge> : null}
                    {event.isSecuritySensitive ? <Badge tone="locked">Security</Badge> : null}
                    {event.isExportable ? <Badge tone="success">Exportable</Badge> : null}
                  </div>
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-muted" colSpan={5}>
                  No normalized audit events matched these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {hasMore ? (
        <p className="text-sm text-muted">
          More events are available. Narrow the filters or page through results in the query layer.
        </p>
      ) : null}
    </main>
  );
}
