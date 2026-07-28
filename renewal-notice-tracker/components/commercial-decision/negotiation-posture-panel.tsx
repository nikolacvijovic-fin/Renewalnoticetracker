import {
  changeCommercialDecisionNegotiationPostureFormAction,
  changeCommercialDecisionRecommendedActionFormAction
} from "@/lib/actions/commercial-decision-workbench";
import {
  COMMERCIAL_RECOMMENDED_ACTIONS,
  NEGOTIATION_POSTURES,
  type CommercialDecision
} from "@/lib/commercial-decision-workbench/decision-types";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export function NegotiationPosturePanel({
  decision,
  canEdit
}: {
  decision: CommercialDecision;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-ink">Commercial posture</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ServerActionForm
          serverAction={changeCommercialDecisionRecommendedActionFormAction.bind(null, decision.id, decision.contract_id)}
        >
          <label className="text-sm text-slate-600">
            Recommended action
            <select
              name="recommended_action"
              defaultValue={decision.recommended_action}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            >
              {COMMERCIAL_RECOMMENDED_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {canEdit ? (
            <Button type="submit" className="mt-3" variant="secondary">
              Update action
            </Button>
          ) : null}
        </ServerActionForm>
        <ServerActionForm
          serverAction={changeCommercialDecisionNegotiationPostureFormAction.bind(null, decision.id, decision.contract_id)}
        >
          <label className="text-sm text-slate-600">
            Negotiation posture
            <select
              name="negotiation_posture"
              defaultValue={decision.negotiation_posture}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            >
              {NEGOTIATION_POSTURES.map((posture) => (
                <option key={posture} value={posture}>
                  {posture.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {canEdit ? (
            <Button type="submit" className="mt-3" variant="secondary">
              Update posture
            </Button>
          ) : null}
        </ServerActionForm>
      </div>
    </div>
  );
}
