import { createCommercialDecisionFormAction } from "@/lib/actions/commercial-decision-workbench";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export function CommercialDecisionEmptyState({
  contractId,
  canCreate
}: {
  contractId: string;
  canCreate: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Commercial Decision Workbench</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">No commercial decision has been created yet</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Create a decision when you are ready to score renewal evidence, attach quote and reminder signals, and start an approval workflow.
      </p>
      {canCreate ? (
        <ServerActionForm serverAction={createCommercialDecisionFormAction.bind(null, contractId)} className="mt-5">
          <Button type="submit">Create decision</Button>
        </ServerActionForm>
      ) : null}
    </div>
  );
}
