import {
  acknowledgeContractAction,
  updateRenewalCycleAction
} from "@/lib/actions/contracts";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export function ContractCycleActions({
  contractId,
  cycleStatus,
  renewalDecisionStatus,
  lastAcknowledgedAt
}: {
  contractId: string;
  cycleStatus: string | null | undefined;
  renewalDecisionStatus: string | null | undefined;
  lastAcknowledgedAt?: string | null;
}) {
  const acknowledgeAction = acknowledgeContractAction.bind(null, contractId);
  const cycleAction = updateRenewalCycleAction.bind(null, contractId);
  const normalizedCycleStatus = cycleStatus ?? "open";
  const decisionRecorded = (renewalDecisionStatus ?? "undecided") !== "undecided";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div id="acknowledgment-panel" className="panel space-y-4 p-6">
        <h3 className="text-base font-semibold">Acknowledgment</h3>
        <p className="text-sm text-slate-600">
          High-risk reminder acknowledgments must be explicit. Replies to email do not count.
        </p>
        <p className="text-sm text-slate-500">
          Current cycle state: {normalizedCycleStatus.replaceAll("_", " ")}
          {lastAcknowledgedAt
            ? ` | Last acknowledged ${new Date(lastAcknowledgedAt).toLocaleDateString()}`
            : ""}
        </p>
        <ServerActionForm serverAction={acknowledgeAction}>
          <Button type="submit" variant="secondary">
            Acknowledge high-risk reminder
          </Button>
        </ServerActionForm>
      </div>
      <div id="cycle-actions-panel" className="panel space-y-4 p-6">
        <h3 className="text-base font-semibold">Cycle actions</h3>
        <p className="text-sm text-slate-600">
          Cycle state tracks workflow progress only. Decision status remains the business truth.
        </p>
        <div className="flex flex-wrap gap-3">
          {decisionRecorded ? (
            <ServerActionForm serverAction={cycleAction}>
              <input type="hidden" name="cycle_status" value="closed" />
              <Button type="submit">Close cycle</Button>
            </ServerActionForm>
          ) : null}
          <ServerActionForm serverAction={cycleAction}>
            <input type="hidden" name="cycle_status" value="parked" />
            <Button type="submit" variant="secondary">
              Park cycle
            </Button>
          </ServerActionForm>
          <ServerActionForm serverAction={cycleAction}>
            <input type="hidden" name="cycle_status" value="reopened" />
            <Button type="submit" variant="secondary">
              Reopen cycle
            </Button>
          </ServerActionForm>
        </div>
      </div>
    </div>
  );
}
