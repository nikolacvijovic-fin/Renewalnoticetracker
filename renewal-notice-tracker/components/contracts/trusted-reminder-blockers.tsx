import { Badge } from "@/components/ui/badge";
import type { ContractDetailTrustExceptionApprovalState } from "@/lib/contracts/contract-detail-view";
import type { TrustedReminderGateResult } from "@/lib/contracts/trusted-reminder-gate";

export function TrustedReminderBlockers({
  gate,
  approvalState
}: {
  gate: TrustedReminderGateResult;
  approvalState?: ContractDetailTrustExceptionApprovalState;
}) {
  const evidencePercent = Math.round(gate.auditMetadata.evidenceConfidence * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Trusted reminder gate
          </p>
          <p className="mt-2 text-lg font-semibold text-ink">
            {gate.canActivate ? "Clock can be trusted" : "Clock needs proof"}
          </p>
        </div>
        <Badge tone={gate.canActivate ? "success" : "warning"}>
          {gate.canActivate ? "Unblocked" : `${gate.failures.length} blocker${gate.failures.length === 1 ? "" : "s"}`}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Evidence confidence
          </p>
          <p className="mt-1 font-semibold text-ink">{evidencePercent}%</p>
          <p className="mt-1 text-xs text-slate-600">
            Approval is an exception; it does not improve evidence quality.
          </p>
        </div>
        {approvalState ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Approval state
            </p>
            <p className="mt-1 font-semibold text-ink">{approvalState.label}</p>
            <p className="mt-1 text-xs text-slate-600">{approvalState.help}</p>
          </div>
        ) : null}
      </div>

      {gate.canActivate ? (
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>Owner, P0 truth, evidence confidence, and schedule are aligned.</p>
          {gate.auditMetadata.lowConfidenceAllowedByApprovedOverride ? (
            <p className="text-amber-800">
              Trusted reminder allowed because a durable approval is active
              {gate.auditMetadata.approvalType ? ` (${gate.auditMetadata.approvalType.replaceAll("_", " ")})` : ""}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {gate.failures.slice(0, 3).map((failure) => (
            <div key={failure.code} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-ink">{failure.message}</p>
              <p className="mt-1 text-sm text-slate-600">{failure.remediation}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Trusted reminder blocked until evidence improves or approval is granted. NoticeControl does not auto-send notices.
      </p>
    </div>
  );
}
