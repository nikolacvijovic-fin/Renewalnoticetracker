import { attachPlaybookAction } from "@/deferred/actions/contracts-future";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { Textarea } from "@/components/ui/textarea";

export function DeferredPlaybookRunForm({
  contractId,
  playbooks
}: {
  contractId: string;
  playbooks: Array<{ id: string; name: string }>;
}) {
  const action = attachPlaybookAction.bind(null, contractId);

  return (
    <ServerActionForm serverAction={action} className="panel space-y-4 p-6">
      <h3 className="text-base font-semibold">Attach playbook</h3>
      <Field label="Playbook">
        <select
          name="playbook_id"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          defaultValue=""
        >
          <option value="">Select playbook</option>
          {playbooks.map((playbook) => (
            <option key={playbook.id} value={playbook.id}>
              {playbook.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Selected steps" description="One step per line">
        <Textarea name="selected_steps" />
      </Field>
      <Button type="submit" variant="secondary">
        Attach playbook
      </Button>
    </ServerActionForm>
  );
}
