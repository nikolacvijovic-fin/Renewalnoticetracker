import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveOrganizationContext, MembershipRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const TRUST_EXCEPTION_APPROVAL_TYPES = [
  "low_confidence_evidence",
  "manual_without_evidence",
  "unsupported_extraction"
] as const;

export type TrustExceptionApprovalType =
  (typeof TRUST_EXCEPTION_APPROVAL_TYPES)[number];

export type TrustExceptionApproval =
  Database["public"]["Tables"]["contract_trust_exception_approvals"]["Row"] & {
    approval_type: TrustExceptionApprovalType;
  };

export const TRUST_EXCEPTION_APPROVAL_AUDIT_ACTIONS = {
  created: "trust_exception_approval.created",
  revoked: "trust_exception_approval.revoked",
  denied: "trust_exception_approval.denied",
  viewed: "trust_exception_approval.viewed",
  usedForTrustedReminderGate: "trust_exception_approval.used_for_trusted_reminder_gate"
} as const;

export type CreateTrustExceptionApprovalInput = {
  context: ActiveOrganizationContext;
  contractId: string;
  approvalType: TrustExceptionApprovalType;
  approvalReason: string;
  sourceFieldKeys?: string[];
  evidenceConfidenceAtApproval: number;
  expiresAt?: string | null;
};

export type RevokeTrustExceptionApprovalInput = {
  context: ActiveOrganizationContext;
  approvalId: string;
  contractId: string;
  revocationReason: string;
};

type TrustExceptionApprovalClient = SupabaseClient<Database>;

type TrustExceptionApprovalOptions = {
  client?: TrustExceptionApprovalClient;
  now?: Date;
};

export class TrustExceptionApprovalAuthorizationError extends Error {
  constructor(public readonly role: MembershipRole) {
    super(`Role "${role}" cannot approve contract trust exceptions.`);
    this.name = "TrustExceptionApprovalAuthorizationError";
  }
}

export class TrustExceptionApprovalScopeError extends Error {
  constructor(public readonly contractId: string, public readonly organizationId: string) {
    super("Contract trust exception approval is not scoped to the active organization.");
    this.name = "TrustExceptionApprovalScopeError";
  }
}

export class TrustExceptionApprovalValidationError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "TrustExceptionApprovalValidationError";
  }
}

export class DuplicateActiveTrustExceptionApprovalError extends Error {
  constructor(public readonly contractId: string, public readonly approvalType: TrustExceptionApprovalType) {
    super("An active trust exception approval already exists for this contract and type.");
    this.name = "DuplicateActiveTrustExceptionApprovalError";
  }
}

const APPROVER_ROLES: MembershipRole[] = ["admin", "operator", "reviewer"];

function getClient(options?: TrustExceptionApprovalOptions) {
  return options?.client ?? createServerSupabaseClient();
}

export function canManageTrustExceptionApproval(role: MembershipRole) {
  return APPROVER_ROLES.includes(role);
}

export function isTrustExceptionApprovalActive(
  approval: Pick<TrustExceptionApproval, "revoked_at" | "expires_at"> | null | undefined,
  now: Date = new Date()
) {
  if (!approval || approval.revoked_at) return false;
  if (!approval.expires_at) return true;

  const expiresAt = new Date(approval.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export async function getActiveTrustExceptionApproval(
  input: {
    organizationId: string;
    contractId: string;
    approvalType?: TrustExceptionApprovalType;
  },
  options?: TrustExceptionApprovalOptions
) {
  const client = getClient(options);
  let query = client
    .from("contract_trust_exception_approvals")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (input.approvalType) {
    query = query.eq("approval_type", input.approvalType);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as TrustExceptionApproval[]).find((approval) =>
    isTrustExceptionApprovalActive(approval, options?.now)
  ) ?? null;
}

export async function listContractTrustExceptionApprovals(
  input: {
    organizationId: string;
    contractId: string;
  },
  options?: TrustExceptionApprovalOptions
) {
  const client = getClient(options);
  const { data, error } = await client
    .from("contract_trust_exception_approvals")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("contract_id", input.contractId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []) as TrustExceptionApproval[];
}

export async function createTrustExceptionApproval(
  input: CreateTrustExceptionApprovalInput,
  options?: TrustExceptionApprovalOptions
) {
  const approvalReason = input.approvalReason.trim();
  if (!approvalReason) {
    throw new TrustExceptionApprovalValidationError("Approval reason is required.");
  }

  if (!canManageTrustExceptionApproval(input.context.role)) {
    await auditTrustExceptionApprovalDenied(input, "role_not_allowed");
    throw new TrustExceptionApprovalAuthorizationError(input.context.role);
  }

  const client = getClient(options);
  await assertContractBelongsToOrganization(client, {
    contractId: input.contractId,
    organizationId: input.context.organizationId
  });

  const existingActiveApproval = await getActiveTrustExceptionApproval(
    {
      organizationId: input.context.organizationId,
      contractId: input.contractId,
      approvalType: input.approvalType
    },
    { client, now: options?.now }
  );

  if (existingActiveApproval) {
    await auditTrustExceptionApprovalDenied(input, "duplicate_active_approval");
    throw new DuplicateActiveTrustExceptionApprovalError(input.contractId, input.approvalType);
  }

  const insertPayload: Database["public"]["Tables"]["contract_trust_exception_approvals"]["Insert"] = {
    organization_id: input.context.organizationId,
    contract_id: input.contractId,
    approved_by_user_id: input.context.user.id,
    approval_type: input.approvalType,
    approval_reason: approvalReason,
    source_field_keys: sanitizeSourceFieldKeys(input.sourceFieldKeys ?? []),
    evidence_confidence_at_approval: clampConfidence(input.evidenceConfidenceAtApproval),
    expires_at: input.expiresAt ?? null
  };

  const { data, error } = await client
    .from("contract_trust_exception_approvals")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;
  const approval = data as TrustExceptionApproval;

  await createAuditLog({
    organizationId: input.context.organizationId,
    actorUserId: input.context.user.id,
    contractId: input.contractId,
    action: TRUST_EXCEPTION_APPROVAL_AUDIT_ACTIONS.created,
    entityType: "contract_trust_exception_approval",
    entityId: approval.id,
    details: buildApprovalAuditDetails(approval)
  });

  return approval;
}

export async function revokeTrustExceptionApproval(
  input: RevokeTrustExceptionApprovalInput,
  options?: TrustExceptionApprovalOptions
) {
  const revocationReason = input.revocationReason.trim();
  if (!revocationReason) {
    throw new TrustExceptionApprovalValidationError("Revocation reason is required.");
  }

  if (!canManageTrustExceptionApproval(input.context.role)) {
    await auditTrustExceptionApprovalDenied(
      {
        context: input.context,
        contractId: input.contractId,
        approvalType: "low_confidence_evidence",
        approvalReason: input.revocationReason,
        evidenceConfidenceAtApproval: 0
      },
      "role_not_allowed"
    );
    throw new TrustExceptionApprovalAuthorizationError(input.context.role);
  }

  const client = getClient(options);
  const { data, error } = await client
    .from("contract_trust_exception_approvals")
    .update({
      revoked_at: (options?.now ?? new Date()).toISOString(),
      revoked_by_user_id: input.context.user.id,
      revocation_reason: revocationReason
    })
    .eq("organization_id", input.context.organizationId)
    .eq("contract_id", input.contractId)
    .eq("id", input.approvalId)
    .select("*")
    .single();

  if (error) throw error;
  const approval = data as TrustExceptionApproval;

  await createAuditLog({
    organizationId: input.context.organizationId,
    actorUserId: input.context.user.id,
    contractId: input.contractId,
    action: TRUST_EXCEPTION_APPROVAL_AUDIT_ACTIONS.revoked,
    entityType: "contract_trust_exception_approval",
    entityId: approval.id,
    details: buildApprovalAuditDetails(approval)
  });

  return approval;
}

export async function auditTrustExceptionApprovalViewed(input: {
  context: ActiveOrganizationContext;
  approval: TrustExceptionApproval | null;
  contractId: string;
}) {
  await createAuditLog(
    {
      organizationId: input.context.organizationId,
      actorUserId: input.context.user.id,
      contractId: input.contractId,
      action: TRUST_EXCEPTION_APPROVAL_AUDIT_ACTIONS.viewed,
      entityType: "contract_trust_exception_approval",
      entityId: input.approval?.id ?? null,
      details: input.approval
        ? buildApprovalAuditDetails(input.approval)
        : { contractId: input.contractId, active: false }
    },
    { mode: "best_effort" }
  );
}

export async function auditTrustExceptionApprovalUsedForTrustedReminderGate(input: {
  context: ActiveOrganizationContext;
  contractId: string;
  approval: TrustExceptionApproval;
  evidenceConfidence: number;
  now?: Date;
}) {
  await createAuditLog(
    {
      organizationId: input.context.organizationId,
      actorUserId: input.context.user.id,
      contractId: input.contractId,
      action: TRUST_EXCEPTION_APPROVAL_AUDIT_ACTIONS.usedForTrustedReminderGate,
      entityType: "contract_trust_exception_approval",
      entityId: input.approval.id,
      details: {
        ...buildApprovalAuditDetails(input.approval, input.now),
        currentEvidenceConfidence: clampConfidence(input.evidenceConfidence),
        activeAtGateEvaluation: isTrustExceptionApprovalActive(input.approval, input.now)
      }
    },
    { mode: "best_effort" }
  );
}

export function buildTrustExceptionApprovalGateEvidence(
  approval: TrustExceptionApproval,
  now: Date = new Date()
) {
  return {
    id: approval.id,
    approvalType: approval.approval_type,
    approvedByUserId: approval.approved_by_user_id,
    approvalReason: approval.approval_reason,
    evidenceConfidenceAtApproval: approval.evidence_confidence_at_approval,
    sourceFieldKeys: approval.source_field_keys,
    activeAtEvaluation: isTrustExceptionApprovalActive(approval, now)
  };
}

function buildApprovalAuditDetails(approval: TrustExceptionApproval, now?: Date) {
  return {
    contractId: approval.contract_id,
    approvalId: approval.id,
    approvalType: approval.approval_type,
    approvedByUserId: approval.approved_by_user_id,
    approvalReason: approval.approval_reason,
    evidenceConfidenceAtApproval: approval.evidence_confidence_at_approval,
    sourceFieldKeys: approval.source_field_keys,
    active: isTrustExceptionApprovalActive(approval, now),
    expiresAt: approval.expires_at,
    revokedAt: approval.revoked_at,
    createdAt: approval.created_at
  };
}

async function auditTrustExceptionApprovalDenied(
  input: CreateTrustExceptionApprovalInput,
  reason: string
) {
  await createAuditLog(
    {
      organizationId: input.context.organizationId,
      actorUserId: input.context.user.id,
      contractId: input.contractId,
      action: TRUST_EXCEPTION_APPROVAL_AUDIT_ACTIONS.denied,
      entityType: "contract",
      entityId: input.contractId,
      details: {
        contractId: input.contractId,
        approvalType: input.approvalType,
        evidenceConfidenceAtApproval: clampConfidence(input.evidenceConfidenceAtApproval),
        sourceFieldKeys: sanitizeSourceFieldKeys(input.sourceFieldKeys ?? []),
        active: false,
        reason
      }
    },
    { mode: "best_effort" }
  );
}

async function assertContractBelongsToOrganization(
  client: TrustExceptionApprovalClient,
  input: { organizationId: string; contractId: string }
) {
  const { data, error } = await client
    .from("contracts")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.contractId)
    .single();

  if (error || !data) {
    throw new TrustExceptionApprovalScopeError(input.contractId, input.organizationId);
  }
}

function sanitizeSourceFieldKeys(keys: string[]) {
  return Array.from(
    new Set(
      keys
        .map((key) => key.trim())
        .filter((key) => /^[a-z0-9_:. -]{1,80}$/i.test(key))
    )
  ).slice(0, 25);
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
