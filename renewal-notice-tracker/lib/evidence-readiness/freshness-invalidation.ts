import { evaluateDesignPartnerBetaMutation, type DesignPartnerBetaControl } from "@/lib/billing/design-partner-beta";
import { recalculateEvidenceReadiness } from "@/lib/evidence-readiness/evidence-readiness-service";
import {
  getAdminEvidenceReadinessBetaControl,
  listAdminEvidenceFreshnessCandidates
} from "@/lib/evidence-readiness/repositories/admin-evidence-readiness-repository";

export async function invalidateStaleEvidenceReadiness(input: {
  limit: number;
  staleBefore: string;
}) {
  const candidates = await listAdminEvidenceFreshnessCandidates({ before: input.staleBefore, limit: input.limit });
  if (candidates.error) throw candidates.error;
  const summary = { considered: 0, recalculated: 0, readOnlySkipped: 0, failed: 0 };

  for (const row of (candidates.data ?? []) as Array<Record<string, unknown>>) {
    const organizationId = typeof row.organization_id === "string" ? row.organization_id : null;
    const contractId = typeof row.contract_id === "string" ? row.contract_id : null;
    if (!organizationId || !contractId) continue;
    summary.considered += 1;

    const controlResult = await getAdminEvidenceReadinessBetaControl(organizationId);
    if (controlResult.error) {
      summary.failed += 1;
      continue;
    }
    const rowControl = controlResult.data as Record<string, unknown> | null;
    const control = rowControl ? {
      organizationId: String(rowControl.organization_id),
      status: String(rowControl.status),
      maximumContracts: Number(rowControl.maximum_contracts),
      maximumProviderConnections: Number(rowControl.maximum_provider_connections),
      maximumUserSeats: Number(rowControl.maximum_user_seats),
      allowedProviders: rowControl.allowed_providers,
      expiresAt: rowControl.expires_at ?? null,
      graceEndsAt: rowControl.grace_ends_at ?? null,
      founderApprovedAt: rowControl.founder_approved_at ?? null
    } as DesignPartnerBetaControl : null;
    const betaDecision = evaluateDesignPartnerBetaMutation({ control, action: "create_findings" });
    if (!betaDecision.allowed) {
      summary.readOnlySkipped += 1;
      continue;
    }

    try {
      await recalculateEvidenceReadiness({
        organizationId,
        contractId,
        trigger: "scheduled_freshness_invalidation"
      });
      summary.recalculated += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
