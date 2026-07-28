import {
  addCommercialDecisionReviewerNoteFormAction,
  approveCommercialDecisionFormAction,
  archiveCommercialDecisionFormAction,
  finalizeCommercialDecisionFormAction,
  recomputeCommercialDecisionFormAction,
  rejectCommercialDecisionFormAction,
  submitCommercialDecisionForReviewFormAction
} from "@/lib/actions/commercial-decision-workbench";
import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export function DecisionActionBar({
  decision,
  canAct
}: {
  decision: CommercialDecision;
  canAct: boolean;
}) {
  if (!canAct) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap gap-2">
        <ServerActionForm serverAction={recomputeCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
          <Button type="submit" variant="secondary">Recompute</Button>
        </ServerActionForm>
        <ServerActionForm serverAction={submitCommercialDecisionForReviewFormAction.bind(null, decision.id, decision.contract_id)}>
          <Button type="submit" variant="secondary">Submit for review</Button>
        </ServerActionForm>
        <ServerActionForm serverAction={approveCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
          <input type="hidden" name="reviewer_note" value="Approved from commercial decision workbench." />
          <Button type="submit">Approve</Button>
        </ServerActionForm>
        <ServerActionForm serverAction={rejectCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
          <input type="hidden" name="reviewer_note" value="Rejected from commercial decision workbench." />
          <Button type="submit" variant="danger">Reject</Button>
        </ServerActionForm>
        <ServerActionForm serverAction={finalizeCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
          <Button type="submit" variant="secondary">Finalize</Button>
        </ServerActionForm>
        <ServerActionForm serverAction={archiveCommercialDecisionFormAction.bind(null, decision.id, decision.contract_id)}>
          <Button type="submit" variant="ghost">Archive</Button>
        </ServerActionForm>
      </div>
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
    </div>
  );
}
