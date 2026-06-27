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
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const GOVERNED_DATA_CLASS_SET = new Set<string>(GOVERNED_DATA_CLASS_IDS);
const FORBIDDEN_METADATA_KEYS = new Set<string>(DATA_GOVERNANCE_FORBIDDEN_METADATA);
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

export function sanitizeGovernanceMetadata(metadata: Record<string, unknown> = {}) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string" && looksSensitiveGovernanceValue(value)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function looksSensitiveGovernanceValue(value: string) {
  return /raw[_\s-]?(contract|ocr|note|payload)|secret|token|storage[_\s-]?path|uploaded[_\s-]?document|debug[_\s-]?trace/i.test(
    value
  );
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
    metadata: sanitizeGovernanceMetadata(input.metadata)
  };
}

function isExpired(expiresAt: unknown, now = new Date()) {
  return typeof expiresAt === "string" && new Date(expiresAt).getTime() <= now.getTime();
}
