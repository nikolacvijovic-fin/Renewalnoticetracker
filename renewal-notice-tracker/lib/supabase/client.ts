"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicConfig } from "@/lib/config";

export function createClient() {
  const config = getPublicConfig();

  return createBrowserClient<Database>(
    config.supabaseUrl,
    config.supabaseAnonKey
  );
}
