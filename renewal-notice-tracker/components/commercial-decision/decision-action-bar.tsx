import {
  addCommercialDecisionReviewerNoteFormAction,
  approveCommercialDecisionFormAction,
  archiveCommercialDecisionFormAction,
  finalizeCommercialDecisionFormAction,
  reassignCommercialDecisionApproverFormAction,
  recomputeCommercialDecisionFormAction,
  rejectCommercialDecisionFormAction,
  submitCommercialDecisionForReviewWithApproverFormAction
} from "@/lib/actions/commercial-decision-workbench";
import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export function DecisionActionBar({
  decision,
  canAct,
  canApprove,
  canReassignApprover,
  approverOptions
}: {
  decision: CommercialDecision;
  canAct: boolean;
  canApprove: boolean;
  canReassignApprover: boolean;
  approverOptions: Array<{ userId: string; label: string }>;
}) {
  if (!canAct) {
    return null;
  }
  const finalState = ["finalized", "archived"].includes(decision.decision_status);
  const rejectedState = decision.decision_status === "rejected";
  const canEditEvidence = !finalState;
  const canSubmit =
    ["draft", "evidence_pending", "ready_for_review"].includes(decision.decision_status) &&
    decision.blocker_codes.every((code) => code === "missing_quote_comparison") &&
    Boolean(decision.approver_user_id);
  const needsApprover = ["draft", "evidence_pending", "ready_for_review"].includes(decision.decision_status) && !decision.approver_user_id;
  const hasBlockingEvidence = decision.blocker_codes.some((code) => code !== "missing_quote_comparison");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Workflow controls</p>
        {needsApprover ? <p className="mt-2 text-sm text-amber-700">Assign an approver before submitting this decision.</p> : null}
        {hasBlockingEvidence ? (
          <p className="mt-2 text-sm text-red-700">Resolve blockers before submitting. Recompute after owner, dates, evidence, or reminder readiness changes.</p>
        ) : null}
        {decision.decision_status === "in_approval" && !canApprove ? (
          <p className="mt-2 text-sm text-slate-600">Only the assigned approver can approve or reject this decision.</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canEditEvidence ? (
          <ServerActionForm serverAction={recomputeCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
            <Button type="submit" variant="secondary">Recompute</Button>
          </ServerActionForm>
        ) : null}

        {canSubmit ? (
          <ServerActionForm serverAction={submitCommercialDecisionForReviewWithApproverFormAction.bind(null, decision.id, decision.contract_id)}>
            <input type="hidden" name="approver_user_id" value={decision.approver_user_id ?? ""} />
            <Button type="submit" variant="secondary">Submit for review</Button>
          </ServerActionForm>
        ) : null}

        {decision.decision_status === "in_approval" && canApprove ? (
          <>
            <ServerActionForm serverAction={approveCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
              <input type="hidden" name="reviewer_note" value="Approved from commercial decision workbench." />
              <Button type="submit">Approve</Button>
            </ServerActionForm>
            <ServerActionForm serverAction={rejectCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
              <input type="hidden" name="reviewer_note" value="Rejected from commercial decision workbench." />
              <Button type="submit" variant="danger">Reject</Button>
            </ServerActionForm>
          </>
        ) : null}

        {decision.decision_status === "approved" ? (
          <ServerActionForm serverAction={finalizeCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
            <Button type="submit" variant="secondary">Finalize</Button>
          </ServerActionForm>
        ) : null}

        {!finalState && !rejectedState ? (
          <ServerActionForm serverAction={archiveCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
            <Button type="submit" variant="ghost">Archive</Button>
          </ServerActionForm>
        ) : null}
      </div>

      {canReassignApprover && !["approved", "rejected", "finalized", "archived"].includes(decision.decision_status) ? (
        <ServerActionForm
          serverAction={reassignCommercialDecisionApproverFormAction.bind(null, decision.id, decision.contract_id)}
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <label className="text-sm font-medium text-slate-700">
            Assigned approver
            <select name="approver_user_id" defaultValue={decision.approver_user_id ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="">Choose approver</option>
              {approverOptions.map((approver) => (
                <option key={approver.userId} value={approver.userId}>
                  {approver.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="mt-3" variant="secondary">
            Reassign approver
          </Button>
        </ServerActionForm>
      ) : null}

      {!finalState ? (
        <ServerActionForm
          serverAction={addCommercialDecisionReviewerNoteFormAction.bind(null, decision.id, decision.contract_id)}
          className="mt-4"
        >
          <label className="text-sm text-slate-600">
            Reviewer note
            <textarea name="reviewer_note" className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <Button type="submit" className="mt-3" variant="secondary">
            Record note snapshot
          </Button>
        </ServerActionForm>
      ) : null}
    </div>
  );
}
