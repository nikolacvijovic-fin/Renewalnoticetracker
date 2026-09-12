import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getAppConfig } from "@/lib/config";

export function createServerSupabaseClient() {
  // Keep the established synchronous client factory during this security upgrade.
  // Next 15 supports this migration bridge while repositories move to async later.
  const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies;
  const config = getAppConfig();

  return createServerClient<Database>(
    config.supabase.url,
    config.supabase.anonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        }
      }
    }
  ) as unknown as SupabaseClient<Database>;
}
