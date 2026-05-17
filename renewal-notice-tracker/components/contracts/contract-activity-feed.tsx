import type { InternalRole } from "@/lib/product/shipping-profile";
import {
  buildAuditDisplaySummary,
  summarizeAuditDetails,
  type AuditDisplayView
} from "@/lib/audit-display";

type AuditLog = {
  id: string;
  action: string;
  created_at: string;
  details?: unknown;
  entity_type?: string | null;
  entity_id?: string | null;
  actor_user_id?: string | null;
};

export { summarizeAuditDetails } from "@/lib/audit-display";

export function ContractActivityFeed({
  auditLogs,
  actorLabels,
  view = "customer",
  internalRole = null
}: {
  auditLogs: AuditLog[];
  actorLabels?: Record<string, string>;
  view?: AuditDisplayView;
  internalRole?: InternalRole | null;
}) {
  return (
    <div className="space-y-4">
      {auditLogs.length > 0 ? (
        auditLogs.map((log) => {
          const summary = buildAuditDisplaySummary(log, {
            actorLabels,
            view,
            internalRole
          });

          return (
            <div key={log.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{summary.actionLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Actor: {summary.actorLabel} | Affected object: {summary.objectLabel}
                  </p>
                </div>
                <p className="text-xs text-slate-500">{summary.timestampLabel}</p>
              </div>
              {summary.detailLines.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {summary.detailLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Recorded in the audit trail for support follow-up.
                </p>
              )}
            </div>
          );
        })
      ) : (
        <p className="text-sm text-slate-500">No workflow activity has been recorded yet.</p>
      )}
    </div>
  );
}
