import {
  DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS,
  DATA_GOVERNANCE_FORBIDDEN_METADATA,
  GOVERNED_DATA_CLASS_IDS,
  type GovernedDataClassId
} from "@/lib/product/data-governance";
import { normalizeCustomerRole } from "@/lib/product/shipping-profile";

export const GOVERNANCE_REQUEST_STATUSES = [
  "requested",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "expired"
] as const;

export type GovernanceRequestStatus = (typeof GOVERNANCE_REQUEST_STATUSES)[number];
export type GovernanceRequestKind = "workspace_deletion" | "contract_export" | "support_access";
export const GOVERNANCE_RETENTION_POLICY_STATUSES = ["draft", "active", "disabled"] as const;
export type GovernanceRetentionPolicyStatus =
  (typeof GOVERNANCE_RETENTION_POLICY_STATUSES)[number];
export const GOVERNANCE_RETENTION_POLICY_BEHAVIORS = [
  "retain_until_workspace_deletion",
  "minimize_after_window",
  "delete_after_window_requires_review"
] as const;
export type GovernanceRetentionPolicyBehavior =
  (typeof GOVERNANCE_RETENTION_POLICY_BEHAVIORS)[number];
export type GovernanceSupportPurposeCode =
  | "customer_support_request"
  | "security_review"
  | "billing_support"
  | "incident_response"
  | "deletion_or_export_support";

export type GovernanceAccessInput = {
  organizationId: string;
  actorUserId: string;
  role: string | null | undefined;
  planTier?: string | null;
  subscriptionStatus?: string | null;
  enterpriseGovernanceEnabled?: boolean;
};

export type GovernanceAccessResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      actorUserId: string;
      role: "admin" | "owner";
    }
  | {
      allowed: false;
      reason:
        | "admin_or_owner_required"
        | "enterprise_plan_required"
        | "active_subscription_required"
        | "feature_disabled";
      organizationId: string;
      actorUserId: string;
      safeMessage: string;
    };

export type GovernanceRetentionPolicyChangeDeniedReason =
  | "admin_or_owner_required"
  | "enterprise_plan_required"
  | "active_subscription_required"
  | "feature_disabled"
  | "organization_scope_mismatch"
  | "unsupported_object_class"
  | "invalid_retention_window"
  | "unsupported_retention_behavior"
  | "unsupported_policy_status";

export type GovernanceRetentionPolicyChangeInput = GovernanceAccessInput & {
  policyId: string;
  policyOrganizationId: string;
  objectClass: GovernedDataClassId | string;
  retentionWindowDays: number;
  behavior: GovernanceRetentionPolicyBehavior | string;
  status: GovernanceRetentionPolicyStatus | string;
  reasonCode?: string | null;
};

export type GovernanceRetentionPolicyRuntimeState = {
  policyId: string;
  organizationId: string;
  objectClass: GovernedDataClassId;
  retentionWindowDays: number;
  behavior: GovernanceRetentionPolicyBehavior;
  status: GovernanceRetentionPolicyStatus;
  deletionRequiresExplicitReview: boolean;
  automaticDeletionAllowed: false;
  reasonCode: string | null;
};

export type GovernanceRetentionPolicyChangeResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      actorUserId: string;
      policy: GovernanceRetentionPolicyRuntimeState;
      audit: ReturnType<typeof buildGovernanceAuditLogInput>;
    }
  | {
      allowed: false;
      reason: GovernanceRetentionPolicyChangeDeniedReason;
      organizationId: string;
      actorUserId: string;
      safeMessage: string;
    };

export type GovernanceLifecycleInput = {
  kind: GovernanceRequestKind;
  id: string;
  organizationId: string;
  status: string;
  requestedAt?: string | null;
  processingStartedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  expiredAt?: string | null;
  failureCode?: string | null;
  failureCategory?: string | null;
  artifactStorage?: string | null;
  expiresAt?: string | null;
  downloadAvailable?: boolean | null;
};

export type GovernanceLifecycleState = {
  kind: GovernanceRequestKind;
  id: string;
  organizationId: string;
  status: GovernanceRequestStatus;
  terminal: boolean;
  successful: boolean;
  failed: boolean;
  downloadable: boolean;
  evidenceComplete: boolean;
  reasonCode: string;
};

export type GovernanceSupportDiagnosticInput = {
  organizationId: string;
  supportActorUserId: string;
  purposeCode?: GovernanceSupportPurposeCode | null;
  objectClass: GovernedDataClassId;
  objectId?: string | null;
  metadata?: Record<string, unknown>;
};

export type GovernanceAuditInput = {
  organizationId: string;
  actorUserId?: string | null;
  eventName: string;
  entityType: "governance" | "export" | "workspace_deletion" | "support_access";
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

const GOVERNANCE_STATUS_SET = new Set<string>(GOVERNANCE_REQUEST_STATUSES);
const GOVERNANCE_RETENTION_POLICY_STATUS_SET = new Set<string>(
  GOVERNANCE_RETENTION_POLICY_STATUSES
);
const GOVERNANCE_RETENTION_POLICY_BEHAVIOR_SET = new Set<string>(
  GOVERNANCE_RETENTION_POLICY_BEHAVIORS
);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const GOVERNED_DATA_CLASS_SET = new Set<string>(GOVERNED_DATA_CLASS_IDS);
const FORBIDDEN_METADATA_KEYS = new Set<string>(DATA_GOVERNANCE_FORBIDDEN_METADATA);
const MIN_RETENTION_WINDOW_DAYS = 1;
const MAX_RETENTION_WINDOW_DAYS = 3650;
const SUPPORT_DIAGNOSTIC_METADATA_ALLOWLIST = new Set([
  "organization_id",
  "actor_user_id",
  "support_actor_id",
  "request_id",
  "object_class",
  "object_id",
  "status",
  "failure_code",
  "failure_category",
  "reason_code",
  "count",
  "checked_at",
  "created_at",
  "updated_at",
  "requested_at",
  "completed_at",
  "failed_at",
  "expired_at",
  "deletion_request_id",
  "export_request_id",
  "preset",
  "format",
  "row_count",
  "artifact_size_bytes",
  "purpose_code"
]);
const SUPPORT_PURPOSE_CODES = new Set<GovernanceSupportPurposeCode>([
  "customer_support_request",
  "security_review",
  "billing_support",
  "incident_response",
  "deletion_or_export_support"
]);

export function evaluateRetentionPolicyChangeAccess(
  input: GovernanceAccessInput
): GovernanceAccessResult {
  const role = normalizeCustomerRole(input.role);
  if (role !== "admin" && role !== "owner") {
    return {
      allowed: false,
      reason: "admin_or_owner_required",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Retention policy changes require an organization admin or owner."
    };
  }

  if (input.planTier !== "enterprise") {
    return {
      allowed: false,
      reason: "enterprise_plan_required",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Configurable retention policies require the Enterprise plan."
    };
  }

  if (!input.subscriptionStatus || !ACTIVE_SUBSCRIPTION_STATUSES.has(input.subscriptionStatus)) {
    return {
      allowed: false,
      reason: "active_subscription_required",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Configurable retention policies require an active Enterprise subscription."
    };
  }

  if (!input.enterpriseGovernanceEnabled) {
    return {
      allowed: false,
      reason: "feature_disabled",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Enterprise governance runtime is not enabled for this workspace."
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    role
  };
}

export function prepareRetentionPolicyChange(
  input: GovernanceRetentionPolicyChangeInput
): GovernanceRetentionPolicyChangeResult {
  const access = evaluateRetentionPolicyChangeAccess(input);
  if (!access.allowed) return access;

  if (input.policyOrganizationId !== input.organizationId) {
    return {
      allowed: false,
      reason: "organization_scope_mismatch",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Retention policy changes must be scoped to the active organization."
    };
  }

  if (!GOVERNED_DATA_CLASS_SET.has(input.objectClass)) {
    return {
      allowed: false,
      reason: "unsupported_object_class",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Retention policy object class is not governed."
    };
  }

  if (
    !Number.isInteger(input.retentionWindowDays) ||
    input.retentionWindowDays < MIN_RETENTION_WINDOW_DAYS ||
    input.retentionWindowDays > MAX_RETENTION_WINDOW_DAYS
  ) {
    return {
      allowed: false,
      reason: "invalid_retention_window",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Retention policy window is outside the supported MVP envelope."
    };
  }

  if (!GOVERNANCE_RETENTION_POLICY_BEHAVIOR_SET.has(input.behavior)) {
    return {
      allowed: false,
      reason: "unsupported_retention_behavior",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Retention policy behavior is not supported."
    };
  }

  if (!GOVERNANCE_RETENTION_POLICY_STATUS_SET.has(input.status)) {
    return {
      allowed: false,
      reason: "unsupported_policy_status",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Retention policy status is not supported."
    };
  }

  const behavior = input.behavior as GovernanceRetentionPolicyBehavior;
  const policy: GovernanceRetentionPolicyRuntimeState = {
    policyId: input.policyId,
    organizationId: input.organizationId,
    objectClass: input.objectClass as GovernedDataClassId,
    retentionWindowDays: input.retentionWindowDays,
    behavior,
    status: input.status as GovernanceRetentionPolicyStatus,
    deletionRequiresExplicitReview: behavior === "delete_after_window_requires_review",
    automaticDeletionAllowed: false,
    reasonCode: input.reasonCode ?? null
  };

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    policy,
    audit: buildGovernanceAuditLogInput({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      eventName: "governance.retention_policy_changed",
      entityType: "governance",
      entityId: input.policyId,
      metadata: {
        organization_id: input.organizationId,
        actor_user_id: input.actorUserId,
        policy_id: input.policyId,
        object_class: policy.objectClass,
        retention_window: `${policy.retentionWindowDays}_days`,
        status: policy.status,
        reason_code: policy.reasonCode ?? undefined
      }
    })
  };
}

export function sanitizeGovernanceMetadata(metadata: Record<string, unknown> = {}) {
  return sanitizeGovernanceRecord(metadata, undefined);
}

function looksSensitiveGovernanceValue(value: string) {
  return /raw[_\s-]?(contract|ocr|note|payload)|contract\s+text|ocr\s+output|full\s+note|provider\s+payload|secret|token|storage[_\s-]?path|backup\s+contents|uploaded[_\s-]?document|email\s+body|debug[_\s-]?trace|sensitive_/i.test(value);
}

function sanitizeGovernanceRecord(
  metadata: Record<string, unknown>,
  allowedKeys: Set<string> | undefined
) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) continue;
    if (allowedKeys && !allowedKeys.has(key)) continue;
    const sanitizedValue = sanitizeGovernanceValue(value, allowedKeys);
    if (sanitizedValue === undefined) continue;
    sanitized[key] = sanitizedValue;
  }
  return sanitized;
}

function sanitizeGovernanceValue(
  value: unknown,
  nestedAllowedKeys: Set<string> | undefined
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return looksSensitiveGovernanceValue(value) ? undefined : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map((item) => sanitizeGovernanceValue(item, nestedAllowedKeys))
      .filter((item) => item !== undefined);
    return sanitizedItems;
  }
  if (typeof value === "object") {
    return sanitizeGovernanceRecord(value as Record<string, unknown>, nestedAllowedKeys);
  }
  return undefined;
}

export function buildGovernanceAuditLogInput(input: GovernanceAuditInput) {
  const contract = DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS.find(
    (event) => event.eventName === input.eventName
  );
  const allowedKeys = new Set<string>(contract?.safeMetadata ?? []);
  const sanitized = sanitizeGovernanceMetadata(input.metadata);
  const details = Object.fromEntries(
    Object.entries(sanitized).filter(([key]) => allowedKeys.size === 0 || allowedKeys.has(key))
  );

  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: input.eventName,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    details
  };
}

export function normalizeGovernanceLifecycleState(
  input: GovernanceLifecycleInput
): GovernanceLifecycleState {
  const status = GOVERNANCE_STATUS_SET.has(input.status)
    ? (input.status as GovernanceRequestStatus)
    : "failed";
  const failureEvidencePresent = Boolean(input.failureCode && input.failureCategory);
  const completedEvidencePresent = Boolean(input.completedAt);
  const expired = status === "expired" || isExpired(input.expiresAt);
  const artifactStored = input.artifactStorage === "stored";
  const downloadable =
    status === "completed" &&
    artifactStored &&
    Boolean(input.downloadAvailable) &&
    !expired;

  if (status === "completed") {
    return {
      kind: input.kind,
      id: input.id,
      organizationId: input.organizationId,
      status,
      terminal: true,
      successful: completedEvidencePresent && !failureEvidencePresent,
      failed: false,
      downloadable,
      evidenceComplete: completedEvidencePresent && !failureEvidencePresent,
      reasonCode: completedEvidencePresent && !failureEvidencePresent
        ? "completed"
        : "completed_state_missing_clean_evidence"
    };
  }

  if (status === "failed") {
    return {
      kind: input.kind,
      id: input.id,
      organizationId: input.organizationId,
      status,
      terminal: true,
      successful: false,
      failed: true,
      downloadable: false,
      evidenceComplete: failureEvidencePresent,
      reasonCode: failureEvidencePresent ? "failed" : "failed_state_missing_failure_evidence"
    };
  }

  if (status === "expired") {
    return {
      kind: input.kind,
      id: input.id,
      organizationId: input.organizationId,
      status,
      terminal: true,
      successful: false,
      failed: false,
      downloadable: false,
      evidenceComplete: Boolean(input.expiredAt || input.expiresAt),
      reasonCode: "expired"
    };
  }

  if (status === "cancelled") {
    return {
      kind: input.kind,
      id: input.id,
      organizationId: input.organizationId,
      status,
      terminal: true,
      successful: false,
      failed: false,
      downloadable: false,
      evidenceComplete: true,
      reasonCode: "cancelled"
    };
  }

  return {
    kind: input.kind,
    id: input.id,
    organizationId: input.organizationId,
    status,
    terminal: false,
    successful: false,
    failed: false,
    downloadable: false,
    evidenceComplete: true,
    reasonCode: status
  };
}

export function buildSupportAccessDiagnostic(input: GovernanceSupportDiagnosticInput) {
  if (!input.purposeCode || !SUPPORT_PURPOSE_CODES.has(input.purposeCode)) {
    return {
      allowed: false as const,
      reason: "purpose_code_required" as const,
      organizationId: input.organizationId,
      supportActorUserId: input.supportActorUserId,
      safeMessage: "Support diagnostics require a purpose code."
    };
  }

  if (!GOVERNED_DATA_CLASS_SET.has(input.objectClass)) {
    return {
      allowed: false as const,
      reason: "unsupported_object_class" as const,
      organizationId: input.organizationId,
      supportActorUserId: input.supportActorUserId,
      safeMessage: "Support diagnostics require a governed data class."
    };
  }

  return {
    allowed: true as const,
    organizationId: input.organizationId,
    supportActorUserId: input.supportActorUserId,
    purposeCode: input.purposeCode,
    objectClass: input.objectClass,
    objectId: input.objectId ?? null,
    metadata: sanitizeGovernanceRecord(input.metadata ?? {}, SUPPORT_DIAGNOSTIC_METADATA_ALLOWLIST)
  };
}

function isExpired(expiresAt: unknown, now = new Date()) {
  return typeof expiresAt === "string" && new Date(expiresAt).getTime() <= now.getTime();
}
