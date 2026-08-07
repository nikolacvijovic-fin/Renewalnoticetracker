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
  "dueAt",
  "completedAt",
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

export function sanitizeRenewalActionAuditMetadata(
  metadata: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_AUDIT_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
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
