import {
  getActiveOrganizationContextOrNull,
  getActiveOrganizationSelectionState,
  requireUser
} from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/forms/settings-form";
import { getOrganizationBilling } from "@/lib/contracts/kernel-queries";
import { getBillingProviderCapability, getBillingProviderLabel } from "@/lib/billing/provider";
import { getCommercialCapabilitySummary, normalizeBillingSnapshot } from "@/lib/billing/entitlements";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = createServerSupabaseClient();
  const [activeContext, selectionState] = await Promise.all([
    getActiveOrganizationContextOrNull(),
    getActiveOrganizationSelectionState(user.id)
  ]);
  const organizationId = activeContext?.organizationId ?? null;
  const role = activeContext?.role ?? null;

  const [{ data: userRow }, { data: memberships }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("organization_id, organizations(name)")
      .eq("user_id", user.id)
  ]);

  const typedUserRow = userRow as {
    full_name: string | null;
      notification_email: string | null;
      default_organization_id?: string | null;
    } | null;
  const typedMemberships = (memberships ?? []) as Array<{
    organization_id: string;
    organizations?: { name: string } | null;
  }>;
  const activeMembership =
    typedMemberships.find((membership) => membership.organization_id === organizationId) ?? null;

  const billing = organizationId
    ? await getOrganizationBilling(organizationId)
    : {
        billing_email: null,
        plan_tier: "free",
        subscription_status: "inactive",
        subscription_current_period_end: null,
        billing_provider: null,
        billing_customer_id: null,
        stripe_customer_id: null,
        trial_started_at: null,
        trial_ends_at: null,
        acquisition_source: null,
        acquisition_campaign: null
      };

  const providerName =
    billing.billing_provider === "paddle"
      ? "paddle"
      : ((billing.billing_provider as "paypal" | "stripe" | null) ?? "paddle");
  const providerLabel = getBillingProviderLabel(providerName);
  const providerCapability = getBillingProviderCapability(providerName);
  const billingSnapshot = normalizeBillingSnapshot({
    organizationId: organizationId ?? user.id,
    plan_tier: billing.plan_tier,
    subscription_status: billing.subscription_status,
    billing_provider: billing.billing_provider
  });
  const commercialSummary = getCommercialCapabilitySummary(billingSnapshot);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-2 text-slate-500">
          Save your profile and choose one active organization before uploading contracts.
        </p>
      </div>
      <SettingsForm
        defaults={{
          full_name: typedUserRow?.full_name ?? "",
          notification_email: typedUserRow?.notification_email ?? user.email ?? "",
          organization_name: activeMembership?.organizations?.name ?? "",
          billing_email: billing.billing_email ?? typedUserRow?.notification_email ?? user.email ?? ""
        }}
        billing={{
          plan_tier: billing.plan_tier,
          subscription_status: billing.subscription_status,
          subscription_current_period_end: billing.subscription_current_period_end,
          billing_provider_label: providerLabel,
          billing_provider_name: providerName,
          management_supported: providerCapability.management.supported,
          management_message: providerCapability.management.message,
          trial_started_at: billing.trial_started_at,
          trial_ends_at: billing.trial_ends_at,
          acquisition_source: billing.acquisition_source,
          commercial_summary: commercialSummary
        }}
        canManageOrg={role === "owner" || role === "admin"}
        organizationOptions={typedMemberships.map((item) => ({
          organizationId: item.organization_id,
          name: item.organizations?.name ?? item.organization_id
        }))}
        activeOrganizationId={
          organizationId ??
          selectionState.memberships[0]?.organization_id ??
          ""
        }
      />
    </section>
  );
}
