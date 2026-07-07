"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createNoteAction(contractId: string, formData: FormData) {
  const { user, organizationId } = await requireOrganization();
  await requireScopedContract(contractId, organizationId);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const supabase = createServerSupabaseClient();
  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      contract_id: contractId,
      organization_id: organizationId,
      author_user_id: user.id,
      body
    })
    .select("id")
    .single();

  if (error) throw error;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    contractId,
    action: "note.created",
    entityType: "note",
    entityId: note.id,
    details: {
      note_length: body.length,
      body_redacted: true
    }
  });

  revalidatePath(`/dashboard/contracts/${contractId}`);
}
