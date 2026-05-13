import { createNoteAction } from "@/lib/actions/contracts";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ contractId }: { contractId: string }) {
  const action = createNoteAction.bind(null, contractId);

  return (
    <ServerActionForm serverAction={action} className="panel space-y-4 p-6">
      <h3 className="text-base font-semibold">Add note</h3>
      <Textarea name="body" placeholder="Capture review context, status, or follow-ups." />
      <Button type="submit">Save note</Button>
    </ServerActionForm>
  );
}
