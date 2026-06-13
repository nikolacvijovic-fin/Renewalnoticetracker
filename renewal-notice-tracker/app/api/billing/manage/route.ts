import { getAppConfig } from "@/lib/config";
import {
  createRouteHandler,
  requireShippedActionRouteAuth,
  routeValidationError
} from "@/lib/http";
import { getOrganizationBilling } from "@/lib/contracts/kernel-queries";
import { createBillingManagementSession } from "@/lib/billing/service";
import { getBillingProviderCapability, resolveBillingProvider } from "@/lib/billing/provider";
import {
  getBillingProviderPolicy,
  getCustomerBillingProvider,
  parseBillingProviderName
} from "@/lib/billing/provider-policy";

export const POST = createRouteHandler(
  {
    auth: requireShippedActionRouteAuth("manage_billing", {
      deniedAuditAction: "billing.management_denied",
      deniedEntityType: "billing"
    })
  },
  async ({ auth: context, url, audit, redirect }) => {
    const { user, organizationId } = context;
    const billing = await getOrganizationBilling(organizationId);
    const providerOverrideParam = url.searchParams.get("provider");
    const providerOverride = parseBillingProviderName(providerOverrideParam);
    const source = url.searchParams.get("source");

    if (providerOverrideParam && !providerOverride) {
      throw routeValidationError(
        "Unsupported billing provider.",
        "ERR_BILLING_STATE_INVALID"
      );
    }

    const requestedPolicy = providerOverride ? getBillingProviderPolicy(providerOverride) : null;
    if (
      requestedPolicy &&
      requestedPolicy.state !== "active_self_serve" &&
      requestedPolicy.state !== "support_led_exception"
    ) {
      throw routeValidationError(
        requestedPolicy.customerMessage,
        "ERR_BILLING_STATE_INVALID"
      );
    }

    const providerName =
      providerOverride === "manual"
        ? "manual"
        : providerOverride === "paypal"
          ? "paypal"
        : billing.billing_provider === "paddle"
          ? resolveBillingProvider(billing, "paddle")
          : getCustomerBillingProvider(billing.billing_provider);
    const capability = getBillingProviderCapability(providerName);

    if (!capability.management.supported) {
      const policy = getBillingProviderPolicy(providerName);
      const appUrl = getAppConfig().public.appUrl;
      await audit({
        organizationId,
        actorUserId: user.id,
        action: "billing.management_unavailable",
        entityType: "billing",
        details: {
          provider: providerName,
          provider_state: policy.state,
          stored_provider: billing.billing_provider ?? null,
          reason: capability.management.message
        }
      });

      return redirect(
        `${appUrl}/dashboard/settings?billing=contact-support&provider=${providerName}`
      );
    }

    const session = await createBillingManagementSession({
      organizationId,
      user,
      billing,
      providerOverride: "paddle",
      source
    });

    if (!session.supported || !session.url) {
      const appUrl = getAppConfig().public.appUrl;
      await audit({
        organizationId,
        actorUserId: user.id,
        action: "billing.management_unavailable",
        entityType: "billing",
        details: {
          provider: providerName,
          reason: session.reason ?? "Provider did not return a management URL."
        }
      });

      return redirect(
        `${appUrl}/dashboard/settings?billing=contact-support&provider=${providerName}`
      );
    }

    return redirect(session.url);
  }
);
