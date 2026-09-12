-- Supabase installs pgcrypto in the trusted extensions schema. Keep the
-- security-definer lookup path explicit so digest() resolves consistently.

alter function public.create_subscription_usage_analysis_scope(uuid, uuid, boolean)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.begin_manual_subscription_usage_sync_attempt(uuid, uuid, text, text, boolean)
  set search_path = pg_catalog, public, extensions, pg_temp;

