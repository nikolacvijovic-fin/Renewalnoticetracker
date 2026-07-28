import { Badge } from "@/components/ui/badge";
import { DecisionActionBar } from "@/components/commercial-decision/decision-action-bar";
import { DecisionApprovalTimeline } from "@/components/commercial-decision/decision-approval-timeline";
import { DecisionBlockersPanel } from "@/components/commercial-decision/decision-blockers-panel";
import { DecisionEvidenceList } from "@/components/commercial-decision/decision-evidence-list";
import { DecisionRiskSummary } from "@/components/commercial-decision/decision-risk-summary";
import { NegotiationPosturePanel } from "@/components/commercial-decision/negotiation-posture-panel";
import type {
  CommercialDecision,
  CommercialDecisionApprovalStep,
  CommercialDecisionEvidenceLink,
  CommercialDecisionSnapshot
} from "@/lib/commercial-decision-workbench/decision-types";
import { formatDate } from "@/lib/utils";

export function CommercialDecisionWorkbenchPanel({
  decision,
  evidenceLinks,
  approvalSteps,
  snapshots,
  ownerLabel,
  approverLabel,
  canAct
}: {
  decision: CommercialDecision;
  evidenceLinks: CommercialDecisionEvidenceLink[];
  approvalSteps: CommercialDecisionApprovalStep[];
  snapshots: CommercialDecisionSnapshot[];
  ownerLabel: string;
  approverLabel: string;
  canAct: boolean;
}) {
  const finalState = ["approved", "rejected", "finalized", "archived"].includes(decision.decision_status);

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Commercial Decision Workbench</p>
            <h1 className="mt-2 text-2xl font-semibold text-ink">
              {decision.recommended_action.replaceAll("_", " ")} this renewal
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{decision.decision_summary ?? "No decision summary recorded."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={finalState ? "locked" : "automation"}>{decision.decision_status.replaceAll("_", " ")}</Badge>
            <Badge tone={decision.blocker_codes.length ? "critical" : "success"}>
              {decision.blocker_codes.length ? "blockers open" : "ready path"}
            </Badge>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Owner</p>
            <p className="mt-1 text-sm font-semibold text-ink">{ownerLabel}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Approver</p>
            <p className="mt-1 text-sm font-semibold text-ink">{approverLabel}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Renewal deadline</p>
            <p className="mt-1 text-sm font-semibold text-ink">{formatDate(decision.renewal_deadline)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Notice deadline</p>
            <p className="mt-1 text-sm font-semibold text-ink">{formatDate(decision.notice_deadline)}</p>
          </div>
        </div>
      </div>

      <DecisionRiskSummary decision={decision} />
      <DecisionBlockersPanel blockers={decision.blocker_codes} warnings={decision.warning_codes} />
      <DecisionActionBar decision={decision} canAct={canAct} />
      <NegotiationPosturePanel decision={decision} canEdit={canAct && !finalState} />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DecisionEvidenceList evidenceLinks={evidenceLinks} />
        <DecisionApprovalTimeline approvalSteps={approvalSteps} snapshots={snapshots} />
      </div>
    </section>
  );
}
