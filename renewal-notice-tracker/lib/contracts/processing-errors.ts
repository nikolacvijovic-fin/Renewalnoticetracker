import { insertContractProcessingError } from "@/lib/contracts/repositories/admin-processing-errors-repository";

export async function recordProcessingError(input: {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  stage: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  await insertContractProcessingError(input);
}
