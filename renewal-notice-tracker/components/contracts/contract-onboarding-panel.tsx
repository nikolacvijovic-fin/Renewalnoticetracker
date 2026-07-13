import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContractDetailTrustExceptionApprovalState } from "@/lib/contracts/contract-detail-view";
import type { RenewalReadinessScore } from "@/lib/contracts/readiness-score";
import type { TrustedReminderGateResult } from "@/lib/contracts/trusted-reminder-gate";

export function ContractOnboardingPanel({
  contractId,
  readinessScore,
  trustedReminderGate,
  approvalState
}: {
  contractId: string;
  readinessScore: RenewalReadinessScore;
  trustedReminderGate: TrustedReminderGateResult;
  approvalState: ContractDetailTrustExceptionApprovalState;
}) {
  const firstBlocker = trustedReminderGate.failures[0];
  const evidencePercent = Math.round(trustedReminderGate.auditMetadata.evidenceConfidence * 100);
  const capable = trustedReminderGate.canActivate;

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            Onboarding activation
          </p>
          <h2 className="mt-2 text-lg font-semibold">
            {capable ? "This contract can produce a trusted reminder" : "This contract is not activation-ready yet"}
          </h2>
        </div>
        <Badge tone={capable ? "success" : "warning"}>
          {capable ? "Ready" : "Blocked"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Readiness
          </p>
          <p className="mt-1 text-xl font-semibold text-ink">{readinessScore.score}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Evidence
          </p>
          <p className="mt-1 text-xl font-semibold text-ink">{evidencePercent}%</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Approval
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{approvalState.label}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        {firstBlocker ? (
          <>
            <p className="text-sm font-semibold text-ink">{firstBlocker.message}</p>
            <p className="mt-1 text-sm text-muted">{firstBlocker.remediation}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink">Trusted reminder gate is clear.</p>
            <p className="mt-1 text-sm text-muted">
              Keep the reminder active and record the renewal decision when the owner responds.
            </p>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button asChild variant={capable ? "secondary" : "primary"}>
          <Link href={`/dashboard/contracts/${contractId}`}>
            {capable ? "Review reminder state" : "Fix activation blocker"}
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/onboarding">View onboarding path</Link>
        </Button>
      </div>
    </div>
  );
}
