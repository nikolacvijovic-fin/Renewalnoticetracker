import { createRenewalDecisionAction } from "@/lib/actions/contracts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { Textarea } from "@/components/ui/textarea";
import { SHIPPED_FIRST_DECISION_STATUSES } from "@/lib/product/shipping-profile";

export function RenewalDecisionForm({ contractId }: { contractId: string }) {
  const action = createRenewalDecisionAction.bind(null, contractId);

  return (
    <ServerActionForm serverAction={action} className="panel space-y-4 p-6">
      <h3 className="text-base font-semibold">Renewal decision</h3>
      <Field label="Status">
        <select
          name="status"
          defaultValue="undecided"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
        >
          {SHIPPED_FIRST_DECISION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Decision date">
        <Input name="decision_date" type="date" />
      </Field>
      <Field label="Summary">
        <Textarea name="summary" required />
      </Field>
      <Field label="Next steps" description="One step per line">
        <Textarea name="next_steps" />
      </Field>
      <Button type="submit" variant="secondary">
        Save decision
      </Button>
    </ServerActionForm>
  );
}
