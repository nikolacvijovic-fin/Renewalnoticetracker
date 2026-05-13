import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { getOrganizationBilling } from "@/lib/contracts/kernel-queries";
import { createBillingManagementSession } from "@/lib/billing/service";
import type { BillingProviderName } from "@/lib/billing/types";
import { createAuditLog } from "@/lib/audit";
import { getBillingProviderCapability, resolveBillingProvider } from "@/lib/billing/provider";

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
          action: "billing.management_denied",
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
  const billing = await getOrganizationBilling(organizationId);
  const url = new URL(request.url);
  const providerOverride = url.searchParams.get("provider") as BillingProviderName | null;
  const source = url.searchParams.get("source");
  if (providerOverride && providerOverride !== "paddle") {
    return NextResponse.json({ error: "Unsupported billing provider." }, { status: 400 });
  }
  const providerName =
    billing.billing_provider === "paddle"
      ? resolveBillingProvider(billing, "paddle")
      : ((billing.billing_provider as BillingProviderName | null) ?? "paddle");
  const capability = getBillingProviderCapability(providerName);

  if (!capability.management.supported) {
    await createAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "billing.management_unavailable",
      entityType: "billing",
      details: {
        provider: providerName,
        reason: capability.management.message
      }
    });

    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=contact-support&provider=${providerName}`,
      { status: 303 }
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
    await createAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "billing.management_unavailable",
      entityType: "billing",
      details: {
        provider: providerName,
        reason: session.reason ?? "Provider did not return a management URL."
      }
    });

    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=contact-support&provider=${providerName}`,
      { status: 303 }
    );
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
