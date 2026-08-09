export const RENEWAL_ACTION_REQUEST_STATUSES = [
  "pending",
  "completed",
  "dismissed",
  "expired"
] as const;

export const RENEWAL_ACTION_RESPONSE_STATUSES = [
  "renew",
  "cancel",
  "renegotiate",
  "defer",
  "needs_more_info",
  "completed",
  "dismissed"
] as const;

export type RenewalActionRequestStatus = (typeof RENEWAL_ACTION_REQUEST_STATUSES)[number];
export type RenewalActionResponseStatus = (typeof RENEWAL_ACTION_RESPONSE_STATUSES)[number];

export type RenewalOwnerAuditAction =
  | "renewal.owner_assigned"
  | "renewal.owner_changed"
  | "renewal.owner_removed";

const SAFE_AUDIT_KEYS = new Set([
  "organizationId",
  "contractId",
  "requestId",
  "actorUserId",
  "previousOwnerUserId",
  "newOwnerUserId",
  "requestedToUserId",
  "requestedByUserId",
  "actionSource",
  "requestedAction",
  "requestStatus",
  "responseStatus",
  "dueDate",
  "dueAt",
  "completedAt",
  "expiredRequestIds",
  "expiredRequestCount",
  "messageLength",
  "noteLength"
]);

const SENSITIVE_KEY_PATTERN =
  /(text|clause|payload|provider|secret|token|storage|path|note|body|email_body|document|file_content|raw)/i;

export function getRenewalOwnerAuditAction(input: {
  previousOwnerUserId?: string | null;
  newOwnerUserId?: string | null;
}): RenewalOwnerAuditAction {
  if (!input.newOwnerUserId) return "renewal.owner_removed";
  if (!input.previousOwnerUserId) return "renewal.owner_assigned";
  return "renewal.owner_changed";
}

export function sanitizeRenewalActionFreeText(value: FormDataEntryValue | string | null | undefined) {
  const text = typeof value === "string" ? value : "";
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? normalized.slice(0, 500) : normalized || null;
}

export function assertRenewalActionResponseStatus(value: string): asserts value is RenewalActionResponseStatus {
  if (!RENEWAL_ACTION_RESPONSE_STATUSES.includes(value as RenewalActionResponseStatus)) {
    throw new Error("Unsupported renewal action response.");
  }
}

export const DEFAULT_RENEWAL_ACTION_TIME_ZONE = "UTC";

export function getOrganizationLocalDate(
  now = new Date(),
  timeZone = DEFAULT_RENEWAL_ACTION_TIME_ZONE
) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function parseRenewalActionDueDate(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Due date is required.");
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error("Due date must be a valid YYYY-MM-DD calendar date.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Due date must be a real calendar date.");
  }

  return trimmed;
}

export function validateRenewalActionDueDate(input: {
  dueDate: string;
  noticeDeadlineDate?: string | null;
  needsReview?: boolean | null;
  now?: Date;
  timeZone?: string;
}) {
  const dueDate = parseRenewalActionDueDate(input.dueDate);
  const today = getOrganizationLocalDate(input.now, input.timeZone);

  if (dueDate < today) {
    throw new Error("Due date cannot be in the past.");
  }

  if (!input.noticeDeadlineDate || input.needsReview) {
    throw new Error("Review and trust the notice deadline before requesting renewal action.");
  }

  const noticeDeadlineDate = parseRenewalActionDueDate(input.noticeDeadlineDate);
  if (dueDate > noticeDeadlineDate) {
    throw new Error("Due date cannot be after the trusted notice deadline.");
  }

  return dueDate;
}

export function sanitizeRenewalActionAuditMetadata(
  metadata: Record<string, unknown>
): Record<string, string | number | boolean | null | string[]> {
  const safe: Record<string, string | number | boolean | null | string[]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_AUDIT_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      safe[key] = value;
    }
  }
  return safe;
}

export function canManageRenewalOwner(role: string) {
  return ["owner", "admin", "operator"].includes(role);
}

export function canRespondToRenewalActionRequest(input: {
  role: string;
  actorUserId: string;
  requestedToUserId: string;
}) {
  return canManageRenewalOwner(input.role) || input.actorUserId === input.requestedToUserId;
}
