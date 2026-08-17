import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function upsertSubscriptionProviderCredential(input: {
  organizationId: string;
  connectionId: string;
  provider: "google_workspace";
  encryptedCredential: string;
  credentialFingerprint: string;
}) {
  const admin = createAdminSupabaseClient();
  return admin.from("subscription_usage_provider_credentials").upsert(
    {
      organization_id: input.organizationId,
      provider_connection_id: input.connectionId,
      provider: input.provider,
      encrypted_credential: input.encryptedCredential,
      credential_fingerprint: input.credentialFingerprint,
      updated_at: new Date().toISOString()
    },
    { onConflict: "organization_id,provider_connection_id" }
  );
}

export async function getSubscriptionProviderCredential(input: {
  organizationId: string;
  connectionId: string;
  provider: "google_workspace";
}) {
  const admin = createAdminSupabaseClient();
  return admin
    .from("subscription_usage_provider_credentials")
    .select("encrypted_credential, credential_fingerprint")
    .eq("organization_id", input.organizationId)
    .eq("provider_connection_id", input.connectionId)
    .eq("provider", input.provider)
    .maybeSingle();
}

export async function deleteSubscriptionProviderCredential(input: {
  organizationId: string;
  connectionId: string;
  provider: "google_workspace";
}) {
  const admin = createAdminSupabaseClient();
  return admin
    .from("subscription_usage_provider_credentials")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("provider_connection_id", input.connectionId)
    .eq("provider", input.provider);
}
