import { Badge } from "@/components/ui/badge";
import type { CommercialDecisionApprovalStep, CommercialDecisionSnapshot } from "@/lib/commercial-decision-workbench/decision-types";
import { formatDate } from "@/lib/utils";

export function DecisionApprovalTimeline({
  approvalSteps,
  snapshots
}: {
  approvalSteps: CommercialDecisionApprovalStep[];
  snapshots: CommercialDecisionSnapshot[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-ink">Approval timeline</h2>
      <div className="mt-4 space-y-3">
        {approvalSteps.length ? (
          approvalSteps.map((step) => (
            <div key={step.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">Step {step.step_order}</p>
                <Badge tone={step.status === "approved" ? "success" : step.status === "rejected" ? "critical" : "default"}>
                  {step.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {step.acted_at ? `Acted ${formatDate(step.acted_at)}` : "Waiting for approval action"}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No approval steps have been created yet.</p>
        )}
      </div>
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recent snapshots</h3>
      <div className="mt-3 space-y-2">
        {snapshots.length ? (
          snapshots.map((snapshot) => (
            <p key={snapshot.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
              {snapshot.snapshot_type.replaceAll("_", " ")} | {snapshot.recommended_action.replaceAll("_", " ")} | {formatDate(snapshot.created_at)}
            </p>
          ))
        ) : (
          <p className="text-sm text-slate-500">No decision snapshots yet.</p>
        )}
      </div>
    </div>
  );
}
