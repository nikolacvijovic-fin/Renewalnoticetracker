import { applyReminderRuleAction } from "@/deferred/actions/contracts-future";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { Textarea } from "@/components/ui/textarea";
import type { CommercialAccessResult } from "@/lib/billing/entitlements";

export function DeferredReminderRuleForm({
  contractId,
  recipientAccess
}: {
  contractId: string;
  recipientAccess: CommercialAccessResult;
}) {
  const action = applyReminderRuleAction.bind(null, contractId);

  return (
    <ServerActionForm serverAction={action} className="panel space-y-4 p-6">
      <h3 className="text-base font-semibold">Custom reminder rule</h3>
      <Field label="Rule name">
        <Input name="rule_name" required />
      </Field>
      <Field label="Offsets" description="Comma-separated ISO offsets like -P45D,-P10D">
        <Input name="offsets" defaultValue="-P30D,-P14D,-P3D" required />
      </Field>
      <Field
        label="Escalation recipients"
        description={
          recipientAccess.allowed
            ? "Comma-separated emails"
            : `${recipientAccess.message} Escalation recipients follow the same plan limit.`
        }
      >
        <Textarea name="escalation_recipients" />
      </Field>
      <Field label="Escalation delay days">
        <Input type="number" name="escalation_delay_days" defaultValue="2" min="0" />
      </Field>
      <Button type="submit" variant="secondary">
        Apply rule
      </Button>
    </ServerActionForm>
  );
}
