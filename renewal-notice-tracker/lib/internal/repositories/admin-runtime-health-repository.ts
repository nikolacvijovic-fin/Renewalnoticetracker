import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function probeDatabaseReadiness() {
  const { error } = await createAdminSupabaseClient()
    .from("organizations")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  return error == null;
}
