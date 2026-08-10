export const CUSTOMER_FEEDBACK_TYPES = [
  "deadline_correct",
  "deadline_incorrect",
  "extraction_problem",
  "reminder_problem",
  "upload_problem",
  "export_problem",
  "billing_problem",
  "request_help",
  "other"
] as const;

export type CustomerFeedbackType = (typeof CUSTOMER_FEEDBACK_TYPES)[number];

export const CUSTOMER_FEEDBACK_SEVERITIES = ["low", "medium", "high", "urgent"] as const;

export type CustomerFeedbackSeverity = (typeof CUSTOMER_FEEDBACK_SEVERITIES)[number];

export const CUSTOMER_FEEDBACK_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;

export type CustomerFeedbackStatus = (typeof CUSTOMER_FEEDBACK_STATUSES)[number];

export const CUSTOMER_FEEDBACK_EVENT_CONTRACTS = [
  "feedback.submitted",
  "feedback.deadline_correctness_recorded",
  "feedback.status_changed",
  "feedback.resolved",
  "feedback.dismissed"
] as const;

export type CustomerFeedbackEventName = (typeof CUSTOMER_FEEDBACK_EVENT_CONTRACTS)[number];

export type CustomerFeedbackSafeContext = Record<string, string | number | boolean | null>;

export type CustomerFeedbackInput = {
  organizationId: string;
  submittedByUserId: string;
  contractId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  feedbackType: CustomerFeedbackType;
  severity?: CustomerFeedbackSeverity;
  message?: string | null;
  safeContext?: Record<string, unknown>;
  submittedAt?: Date;
};

export type CustomerFeedbackInsert = {
  organization_id: string;
  contract_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  submitted_by_user_id: string;
  feedback_type: CustomerFeedbackType;
  severity: CustomerFeedbackSeverity;
  status: "open";
  message: string | null;
  safe_context: CustomerFeedbackSafeContext;
  idempotency_key: string;
};

export type CustomerFeedbackReference = {
  id: string;
  reference: string;
  status: CustomerFeedbackStatus;
  feedbackType: CustomerFeedbackType;
  createdAt?: string | null;
  duplicate?: boolean;
};

const FEEDBACK_IDEMPOTENCY_BUCKET_MS = 5 * 60 * 1000;

export type CustomerFeedbackStatusChangeInput = {
  organizationId: string;
  feedbackId: string;
  actorUserId: string;
  fromStatus?: CustomerFeedbackStatus | null;
  toStatus: CustomerFeedbackStatus;
  feedbackType?: CustomerFeedbackType | string | null;
  severity?: CustomerFeedbackSeverity | string | null;
  entityType?: string | null;
  entityId?: string | null;
};

const SAFE_CONTEXT_KEYS = new Set([
  "currentRoute",
  "contractId",
  "fieldName",
  "reviewStatus",
  "deadlineWindow",
  "exportType",
  "reminderType",
  "decisionStatus",
  "sourceSurface",
  "organizationId",
  "actorUserId",
  "entityType",
  "entityId",
  "browserUserAgent"
]);

const FORBIDDEN_KEY_PATTERN =
  /(raw|body|text|clause|ocr|payload|secret|token|password|private|note|email_body|storage|path|provider|prompt|response|file|template)/i;

const SENSITIVE_VALUE_PATTERN =
  /(raw contract|full contract|extracted clause|ocr output|provider payload|private note|email body|secret_|token_|bearer\s+[a-z0-9._-]+|-----BEGIN|storage\/|\.pdf\b|generated cancellation|renegotiation template)/gi;

const SENSITIVE_VALUE_TEST_PATTERN =
  /(raw contract|full contract|extracted clause|ocr output|provider payload|private note|email body|secret_|token_|bearer\s+[a-z0-9._-]+|-----BEGIN|storage\/|\.pdf\b|generated cancellation|renegotiation template)/i;

function isFeedbackType(value: string): value is CustomerFeedbackType {
  return CUSTOMER_FEEDBACK_TYPES.includes(value as CustomerFeedbackType);
}

function isSeverity(value: string): value is CustomerFeedbackSeverity {
  return CUSTOMER_FEEDBACK_SEVERITIES.includes(value as CustomerFeedbackSeverity);
}

export function isCustomerFeedbackStatus(value: string): value is CustomerFeedbackStatus {
  return CUSTOMER_FEEDBACK_STATUSES.includes(value as CustomerFeedbackStatus);
}

function cleanIdentifier(value: string | null | undefined, maxLength = 120) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function sanitizeCustomerFeedbackMessage(value: string | null | undefined) {
  const sanitized = (value ?? "")
    .replace(SENSITIVE_VALUE_PATTERN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);

  return sanitized || null;
}

export function sanitizeCustomerFeedbackSafeContext(value: unknown): CustomerFeedbackSafeContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const output: CustomerFeedbackSafeContext = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SAFE_CONTEXT_KEYS.has(key) || FORBIDDEN_KEY_PATTERN.test(key)) continue;
    if (entry === null || typeof entry === "boolean") {
      output[key] = entry;
      continue;
    }
    if (typeof entry === "number") {
      if (Number.isFinite(entry)) output[key] = entry;
      continue;
    }
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (!trimmed || SENSITIVE_VALUE_TEST_PATTERN.test(trimmed)) continue;
      output[key] = trimmed.slice(0, 180);
    }
  }

  return output;
}

export function buildCustomerFeedbackInsert(input: CustomerFeedbackInput): CustomerFeedbackInsert {
  const organizationId = cleanIdentifier(input.organizationId);
  const submittedByUserId = cleanIdentifier(input.submittedByUserId);
  const message = sanitizeCustomerFeedbackMessage(input.message);

  if (!organizationId) throw new Error("organization_id_required");
  if (!submittedByUserId) throw new Error("submitted_by_user_id_required");
  if (!isFeedbackType(input.feedbackType)) throw new Error("feedback_type_invalid");
  if (input.severity && !isSeverity(input.severity)) throw new Error("feedback_severity_invalid");

  const contractId = cleanIdentifier(input.contractId);
  const entityType = cleanIdentifier(input.entityType, 80);
  const entityId = cleanIdentifier(input.entityId);
  const safeContext = sanitizeCustomerFeedbackSafeContext({
    ...input.safeContext,
    organizationId,
    actorUserId: submittedByUserId,
    contractId: contractId ?? input.safeContext?.contractId,
    entityType: entityType ?? input.safeContext?.entityType,
    entityId: entityId ?? input.safeContext?.entityId
  });
  const idempotencyKey = buildCustomerFeedbackIdempotencyKey({
    organizationId,
    submittedByUserId,
    contractId,
    entityType,
    entityId,
    feedbackType: input.feedbackType,
    message,
    safeContext,
    submittedAt: input.submittedAt
  });

  return {
    organization_id: organizationId,
    contract_id: contractId,
    entity_type: entityType,
    entity_id: entityId,
    submitted_by_user_id: submittedByUserId,
    feedback_type: input.feedbackType,
    severity: input.severity ?? "medium",
    status: "open",
    message,
    safe_context: safeContext,
    idempotency_key: idempotencyKey
  };
}

export function buildCustomerFeedbackIdempotencyKey(input: {
  organizationId: string;
  submittedByUserId: string;
  contractId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  feedbackType: CustomerFeedbackType;
  message?: string | null;
  safeContext?: CustomerFeedbackSafeContext;
  submittedAt?: Date;
}) {
  const bucket = Math.floor((input.submittedAt ?? new Date()).getTime() / FEEDBACK_IDEMPOTENCY_BUCKET_MS);
  const fingerprint = [
    input.organizationId,
    input.submittedByUserId,
    input.contractId ?? "",
    input.entityType ?? "",
    input.entityId ?? "",
    input.feedbackType,
    input.safeContext?.currentRoute ?? "",
    input.safeContext?.fieldName ?? "",
    input.message ?? "",
    String(bucket)
  ].join("|");

  return `customer_feedback:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

export function buildCustomerFeedbackReference(input: {
  id: string;
  status: string;
  feedbackType: string;
  createdAt?: string | null;
  duplicate?: boolean;
}): CustomerFeedbackReference {
  const id = cleanIdentifier(input.id);
  if (!id) throw new Error("feedback_id_required");
  const status = isCustomerFeedbackStatus(input.status) ? input.status : "open";
  const feedbackType = isFeedbackType(input.feedbackType) ? input.feedbackType : "other";
  return {
    id,
    reference: `FB-${id.slice(0, 8).toUpperCase()}`,
    status,
    feedbackType,
    createdAt: input.createdAt ?? null,
    duplicate: input.duplicate ?? false
  };
}

export function buildCustomerFeedbackEventMetadata(input: CustomerFeedbackStatusChangeInput) {
  const feedbackId = cleanIdentifier(input.feedbackId);
  const organizationId = cleanIdentifier(input.organizationId);
  const actorUserId = cleanIdentifier(input.actorUserId);
  const toStatus = input.toStatus;

  if (!feedbackId) throw new Error("feedback_id_required");
  if (!organizationId) throw new Error("organization_id_required");
  if (!actorUserId) throw new Error("actor_user_id_required");
  if (!isCustomerFeedbackStatus(toStatus)) throw new Error("feedback_status_invalid");

  return {
    organizationId,
    actorUserId,
    feedbackId,
    feedbackType: typeof input.feedbackType === "string" && isFeedbackType(input.feedbackType) ? input.feedbackType : null,
    severity: typeof input.severity === "string" && isSeverity(input.severity) ? input.severity : null,
    entityType: cleanIdentifier(input.entityType, 80),
    entityId: cleanIdentifier(input.entityId),
    status: toStatus,
    fromStatus: input.fromStatus && isCustomerFeedbackStatus(input.fromStatus) ? input.fromStatus : null,
    toStatus
  };
}

export function eventNameForFeedbackStatus(toStatus: CustomerFeedbackStatus): CustomerFeedbackEventName {
  if (toStatus === "resolved") return "feedback.resolved";
  if (toStatus === "dismissed") return "feedback.dismissed";
  return "feedback.status_changed";
}
import { createHash } from "node:crypto";
