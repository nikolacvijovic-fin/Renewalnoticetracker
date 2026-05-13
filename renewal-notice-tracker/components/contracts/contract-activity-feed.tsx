import { formatDate } from "@/lib/utils";

type AuditLog = {
  id: string;
  action: string;
  created_at: string;
  details?: unknown;
  entity_type?: string | null;
  entity_id?: string | null;
  actor_user_id?: string | null;
};

function normalizeDetailLine(value: string) {
  return value.replaceAll("_", " ");
}

function toSentenceCase(value: string) {
  const normalized = normalizeDetailLine(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatAuditAction(action: string) {
  if (action.includes(".")) {
    const [scope = action, verb = "updated"] = action.split(".", 2);
    return `${toSentenceCase(scope)}: ${normalizeDetailLine(verb)}`;
  }

  return toSentenceCase(action);
}

function describeAffectedObject(log: AuditLog) {
  if (!log.entity_type) {
    return "Contract workflow";
  }

  return log.entity_id
    ? `${normalizeDetailLine(log.entity_type)} ${log.entity_id.slice(0, 8)}`
    : normalizeDetailLine(log.entity_type);
}

export function summarizeAuditDetails(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }

  const record = details as Record<string, unknown>;
  const summary: string[] = [];

  if (typeof record.needs_review === "boolean") {
    summary.push(record.needs_review ? "Kept in review" : "Marked review complete");
  }
  if (typeof record.cycle_status === "string") {
    summary.push(`Cycle state: ${normalizeDetailLine(record.cycle_status)}`);
  }
  if (typeof record.processing_status === "string") {
    if (record.processing_status === "blocked_by_review") {
      summary.push("Trusted reminders blocked by review");
    } else if (record.processing_status === "blocked_by_missing_owner") {
      summary.push("Trusted reminders blocked by missing owner");
    } else if (record.processing_status === "blocked_by_missing_operational_date") {
      summary.push("Trusted reminders blocked until a confirmed operational date exists");
    } else if (record.processing_status === "reminders_scheduled" || record.processing_status === "scheduled") {
      summary.push("Trusted reminders scheduled");
    }
  }
  if (
    typeof record.renewal_decision_status === "string" &&
    record.renewal_decision_status !== "undecided"
  ) {
    summary.push(`Decision: ${normalizeDetailLine(record.renewal_decision_status)}`);
  }
  if (typeof record.reminder_regenerated_count === "number" && record.reminder_regenerated_count > 0) {
    summary.push(`Regenerated ${record.reminder_regenerated_count} reminders`);
  }
  if (typeof record.superseded_reminder_count === "number" && record.superseded_reminder_count > 0) {
    summary.push(`Superseded ${record.superseded_reminder_count} prior reminders`);
  }
  if (typeof record.body_preview === "string" && record.body_preview.trim().length > 0) {
    summary.push(record.body_preview.trim());
  }
  if (typeof record.acknowledged_at === "string") {
    summary.push("Acknowledgment recorded");
  }
  if (typeof record.review_reason === "string" && record.review_reason.trim().length > 0) {
    summary.push(`Review reason: ${record.review_reason.trim()}`);
  }
  if (typeof record.summary === "string" && record.summary.trim().length > 0) {
    summary.push(record.summary.trim());
  }
  if (typeof record.status === "string" && record.status !== "undecided") {
    summary.push(`Updated status: ${normalizeDetailLine(record.status)}`);
  }

  return summary;
}

export function ContractActivityFeed({
  auditLogs,
  actorLabels
}: {
  auditLogs: AuditLog[];
  actorLabels?: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      {auditLogs.length > 0 ? (
        auditLogs.map((log) => {
          const detailLines = summarizeAuditDetails(log.details);
          const actorLabel = log.actor_user_id
            ? actorLabels?.[log.actor_user_id] ?? log.actor_user_id
            : "System";

          return (
            <div key={log.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{formatAuditAction(log.action)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Actor: {actorLabel} | Affected object: {describeAffectedObject(log)}
                  </p>
                </div>
                <p className="text-xs text-slate-500">{formatDate(log.created_at)}</p>
              </div>
              {detailLines.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {detailLines.map((line) => (
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
