"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/auth";
import {
  createTrustExceptionApproval,
  listContractTrustExceptionApprovals,
  revokeTrustExceptionApproval,
  type TrustExceptionApprovalType
} from "@/lib/contracts/trust-exception-approvals";

export async function createTrustExceptionApprovalAction(input: {
  contractId: string;
  approvalType?: TrustExceptionApprovalType;
  approvalReason: string;
  sourceFieldKeys?: string[];
  evidenceConfidenceAtApproval: number;
  expiresAt?: string | null;
}) {
  const context = await requireActiveOrganization();
  const approval = await createTrustExceptionApproval({
    context,
    contractId: input.contractId,
    approvalType: input.approvalType ?? "low_confidence_evidence",
    approvalReason: input.approvalReason,
    sourceFieldKeys: input.sourceFieldKeys,
    evidenceConfidenceAtApproval: input.evidenceConfidenceAtApproval,
    expiresAt: input.expiresAt ?? null
  });

  revalidatePath(`/dashboard/contracts/${input.contractId}`);
  return approval;
}

export async function revokeTrustExceptionApprovalAction(input: {
  contractId: string;
  approvalId: string;
  revocationReason: string;
}) {
  const context = await requireActiveOrganization();
  const approval = await revokeTrustExceptionApproval({
    context,
    contractId: input.contractId,
    approvalId: input.approvalId,
    revocationReason: input.revocationReason
  });

  revalidatePath(`/dashboard/contracts/${input.contractId}`);
  return approval;
}

export async function listContractTrustExceptionApprovalsAction(input: {
  contractId: string;
}) {
  const context = await requireActiveOrganization();
  return listContractTrustExceptionApprovals({
    organizationId: context.organizationId,
    contractId: input.contractId
  });
}
