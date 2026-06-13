import {
  createRouteHandler,
  requireShippedActionRouteAuth,
  routeValidationError
} from "@/lib/http";
import { getOrganizationBilling } from "@/lib/contracts/kernel-queries";
import { createBillingCheckoutSession } from "@/lib/billing/service";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getBillingProviderPolicy, parseBillingProviderName } from "@/lib/billing/provider-policy";

export const POST = createRouteHandler(
  {
    auth: requireShippedActionRouteAuth("manage_billing", {
      deniedAuditAction: "billing.checkout_denied",
      deniedEntityType: "billing"
    })
  },
  async ({ auth: context, url, request, audit, redirect }) => {
    const { user, organizationId } = context;
    const plan = (url.searchParams.get("plan") ?? "growth") as "starter" | "growth";
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

    if (requestedPolicy?.state === "support_led_exception") {
      await audit({
        organizationId,
        actorUserId: user.id,
        action: "billing.checkout_unavailable",
        entityType: "billing",
        details: {
          provider: requestedPolicy.provider,
          provider_state: requestedPolicy.state,
          reason: requestedPolicy.customerMessage
        }
      });
      return redirect(
        `${new URL(request.url).origin}/dashboard/settings?billing=contact-support&provider=${requestedPolicy.provider}`
      );
    }

    if (requestedPolicy && requestedPolicy.state !== "active_self_serve") {
      throw routeValidationError(
        requestedPolicy.customerMessage,
        "ERR_BILLING_STATE_INVALID"
      );
    }

    const billing = await getOrganizationBilling(organizationId);
    const session = await createBillingCheckoutSession({
      organizationId,
      user,
      billing,
      plan,
      providerOverride: "paddle",
      source
    });

    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "billing_checkout_started",
      sourceOfTruth: "event_and_state",
      idempotencyKey: session.checkoutId
        ? `billing_checkout_started:${session.checkoutId}`
        : `billing_checkout_started:${organizationId}:${plan}:${source ?? "direct"}`,
      properties: {
        plan,
        provider: "paddle",
        source: source ?? null
      }
    });

    return redirect(session.url);
  }
);
