import { NextResponse } from "next/server";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { getOrganizationBilling } from "@/lib/contracts/kernel-queries";
import { createBillingCheckoutSession } from "@/lib/billing/service";
import type { BillingProviderName } from "@/lib/billing/types";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await getActiveOrganizationContextOrNull();
  let context;
  try {
    context = await assertCanUseShippedAction(auth, "manage_billing", {
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "billing.checkout_denied",
          entityType: "billing",
          details: {
            denied_action: action,
            denied_reason: reason
          }
        });
      }
    });
  } catch (error) {
    if (error instanceof ActiveOrganizationRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof OrganizationAuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
  const { user, organizationId } = context;
  const url = new URL(request.url);
  const plan = (url.searchParams.get("plan") ?? "growth") as "starter" | "growth";
  const providerOverride = url.searchParams.get("provider") as BillingProviderName | null;
  const source = url.searchParams.get("source");
  if (providerOverride && providerOverride !== "paddle") {
    return NextResponse.json({ error: "Unsupported billing provider." }, { status: 400 });
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

  return NextResponse.redirect(session.url, { status: 303 });
}
