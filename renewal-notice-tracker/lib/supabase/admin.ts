import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getAppConfig } from "@/lib/config";

export function createAdminSupabaseClient() {
  const config = getAppConfig();

  return createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  ) as unknown as SupabaseClient<Database>;
}
