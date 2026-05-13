import { createReminderAction } from "@/lib/actions/contracts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";
import type { CommercialAccessResult } from "@/lib/billing/entitlements";

export function ReminderForm({
  contractId,
  defaultEmail,
  recipientAccess
}: {
  contractId: string;
  defaultEmail: string;
  recipientAccess: CommercialAccessResult;
}) {
  const action = createReminderAction.bind(null, contractId);

  return (
    <ServerActionForm serverAction={action} className="panel space-y-4 p-6">
      <div>
        <h3 className="text-base font-semibold">Add manual reminder</h3>
        <p className="mt-1 text-sm text-slate-500">
          Use this only when the default reminder schedule needs a simple operator override.
        </p>
      </div>
      <Field label="Type">
        <select
          name="reminder_type"
          defaultValue="notice_deadline"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
        >
          <option value="notice_deadline">Notice deadline</option>
          <option value="renewal">Renewal</option>
          <option value="expiration">Expiration</option>
          <option value="decision_request">Decision request</option>
          <option value="acknowledgment_request">Acknowledgment request</option>
        </select>
      </Field>
      <Field label="Reminder date and time">
        <Input type="datetime-local" name="remind_at" required />
      </Field>
      <Field label="Recipient email">
        <Input type="hidden" name="recipient_email" defaultValue={defaultEmail} />
        <Input
          type="text"
          name="recipient_emails"
          defaultValue={defaultEmail}
          required
          placeholder="ops@example.com, finance@example.com"
        />
        {!recipientAccess.allowed ? (
          <p className="mt-1 text-xs text-amber-700">
            {recipientAccess.message}
          </p>
        ) : null}
      </Field>
      <Button type="submit">Save reminder</Button>
    </ServerActionForm>
  );
}
