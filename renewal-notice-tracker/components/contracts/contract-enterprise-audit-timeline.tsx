import { Badge } from "@/components/ui/badge";
import type { EnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-event-model";
import { formatDate } from "@/lib/utils";

function severityTone(severity: EnterpriseAuditEvent["severity"]) {
  if (severity === "critical") return "critical" as const;
  if (severity === "warning") return "warning" as const;
  return "default" as const;
}

export function ContractEnterpriseAuditTimeline({
  events
}: {
  events: EnterpriseAuditEvent[];
}) {
  return (
    <div className="space-y-4">
      {events.length > 0 ? (
        events.map((event) => (
          <div key={event.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={severityTone(event.severity)}>{event.severity}</Badge>
                  <Badge>{event.eventCategory.replaceAll("_", " ")}</Badge>
                  {event.isTrustSensitive ? <Badge tone="automation">Trust-sensitive</Badge> : null}
                  {event.isSecuritySensitive ? <Badge tone="locked">Security-sensitive</Badge> : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">{event.summary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Actor: {event.actorLabel} | Source: {event.eventSource}
                </p>
              </div>
              <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-500">
          No trust-sensitive enterprise audit events have been recorded for this contract yet.
        </p>
      )}
    </div>
  );
}
