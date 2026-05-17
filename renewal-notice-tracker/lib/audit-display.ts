import type { InternalRole } from "@/lib/product/shipping-profile";
import { formatDate } from "@/lib/utils";

export type AuditLogDisplayRecord = {
  id: string;
  action: string;
  created_at: string;
  details?: unknown;
  entity_type?: string | null;
  entity_id?: string | null;
  actor_user_id?: string | null;
};

export type AuditDisplayView = "customer" | "internal";

export type AuditDisplaySummary = {
  actionLabel: string;
  actorLabel: string;
  timestampLabel: string;
  objectLabel: string;
  detailLines: string[];
};

function normalizeDetailLine(value: string) {
  return value.replaceAll("_", " ");
}

function toSentenceCase(value: string) {
  const normalized = normalizeDetailLine(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatAuditAction(action: string) {
  if (action.includes(".")) {
    const [scope = action, verb = "updated"] = action.split(".", 2);
    return `${toSentenceCase(scope)}: ${normalizeDetailLine(verb)}`;
  }

  return toSentenceCase(action);
}

export function describeAuditObject(log: AuditLogDisplayRecord, view: AuditDisplayView) {
  if (!log.entity_type) {
    return "Contract workflow";
  }

  const objectType = toSentenceCase(log.entity_type);
  if (view === "internal" && log.entity_id) {
    return `${objectType} ${log.entity_id.slice(0, 8)}`;
  }

  return objectType;
}

function pushIfPresent(summary: string[], value: string | null | undefined) {
  if (value && value.trim().length > 0) {
    summary.push(value.trim());
  }
}

function summarizeProcessingStatus(summary: string[], value: string) {
  if (value === "blocked_by_review") {
    summary.push("Trusted reminders blocked by review");
  } else if (value === "blocked_by_missing_owner") {
    summary.push("Trusted reminders blocked by missing owner");
  } else if (value === "blocked_by_missing_operational_date") {
    summary.push("Trusted reminders blocked until a confirmed operational date exists");
  } else if (value === "blocked_by_missing_p0") {
    summary.push("Trusted reminders blocked until a confirmed P0 date exists");
  } else if (value === "reminders_scheduled" || value === "scheduled") {
    summary.push("Trusted reminders scheduled");
  } else if (value === "failed") {
    summary.push("Reminder scheduling failed");
  } else if (value === "superseded") {
    summary.push("Prior reminders superseded");
  }
}

export function summarizeAuditDetails(
  details: unknown,
  view: AuditDisplayView = "customer"
) {
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
    summarizeProcessingStatus(summary, record.processing_status);
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
  if (typeof record.acknowledged_at === "string") {
    summary.push("Acknowledgment recorded");
  }
  if (typeof record.review_reason === "string" && record.review_reason.trim().length > 0) {
    summary.push(
      view === "internal"
        ? `Review reason: ${record.review_reason.trim()}`
        : "Exception review reason recorded"
    );
  }
  if (typeof record.summary === "string" && record.summary.trim().length > 0) {
    summary.push(view === "internal" ? `Summary: ${record.summary.trim()}` : "Summary recorded");
  }
  if (typeof record.status === "string" && record.status !== "undecided") {
    summary.push(`Updated status: ${normalizeDetailLine(record.status)}`);
  }

  if (view === "internal") {
    if (typeof record.file_name === "string" && record.file_name.trim().length > 0) {
      summary.push(`File: ${record.file_name.trim()}`);
    }
    if (
      typeof record.imported_count === "number" &&
      typeof record.row_count === "number" &&
      record.row_count > 0
    ) {
      summary.push(`Imported ${record.imported_count}/${record.row_count} rows`);
    }
    if (typeof record.format === "string" && record.format.trim().length > 0) {
      summary.push(`Export format: ${record.format.trim()}`);
    }
    if (typeof record.event_count === "number") {
      summary.push(`Generated ${record.event_count} calendar events`);
    }
    if (typeof record.recipient_identity === "string" && record.recipient_identity.trim().length > 0) {
      summary.push(`Recipient: ${record.recipient_identity.trim()}`);
    }
    if (typeof record.internal_role === "string" && record.internal_role.trim().length > 0) {
      summary.push(`Internal role: ${normalizeDetailLine(record.internal_role.trim())}`);
    }
    if (typeof record.scope === "string" && record.scope.trim().length > 0) {
      summary.push(`Scope: ${normalizeDetailLine(record.scope.trim())}`);
    }
    if (typeof record.source === "string" && record.source.trim().length > 0) {
      summary.push(`Source: ${normalizeDetailLine(record.source.trim())}`);
    }
    if (typeof record.error_message === "string" && record.error_message.trim().length > 0) {
      summary.push(`Error: ${record.error_message.trim()}`);
    }
  }

  return Array.from(new Set(summary));
}

export function buildAuditDisplaySummary(
  log: AuditLogDisplayRecord,
  options?: {
    actorLabels?: Record<string, string>;
    view?: AuditDisplayView;
    internalRole?: InternalRole | null;
  }
): AuditDisplaySummary {
  const view = options?.view ?? "customer";
  if (view === "internal" && !options?.internalRole) {
    throw new Error("Internal audit detail requires an internal role.");
  }

  const actorLabel = log.actor_user_id
    ? options?.actorLabels?.[log.actor_user_id] ?? log.actor_user_id
    : "System";

  return {
    actionLabel: formatAuditAction(log.action),
    actorLabel,
    timestampLabel: formatDate(log.created_at),
    objectLabel: describeAuditObject(log, view),
    detailLines: summarizeAuditDetails(log.details, view)
  };
}
