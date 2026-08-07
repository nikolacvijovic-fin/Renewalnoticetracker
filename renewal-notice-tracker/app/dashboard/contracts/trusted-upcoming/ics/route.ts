import { NextResponse } from "next/server";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getAppConfig } from "@/lib/config";
import { buildCalendar, buildTrustedUpcomingContractCalendarEvents } from "@/lib/contracts/ics";
import { getRenewalCommandCenterContracts } from "@/lib/dashboard/renewal-command-center";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";

export async function GET() {
  const auth = await getActiveOrganizationContextOrNull();
  let contextAuth;
  try {
    contextAuth = await assertCanUseShippedAction(auth, SHIPPED_EXPORT_CLASSIFICATION.ics.action, {
      organizationId: auth?.organizationId ?? null,
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "contract.ics_export_denied",
          entityType: "export",
          details: {
            export_classification: "trusted_upcoming_ics",
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

  const contracts = await getRenewalCommandCenterContracts(contextAuth.organizationId);
  const events = buildTrustedUpcomingContractCalendarEvents({
    contracts,
    appUrl: getAppConfig().public.appUrl
  });
  const ics = buildCalendar(events);

  await createAuditLog({
    organizationId: contextAuth.organizationId,
    actorUserId: contextAuth.user.id,
    action: SHIPPED_EXPORT_CLASSIFICATION.ics.auditAction,
    entityType: "export",
    details: {
      event_count: events.length,
      export_classification: "trusted_upcoming_ics"
    }
  });

  await trackServerAnalyticsEvent({
    organizationId: contextAuth.organizationId,
    actorUserId: contextAuth.user.id,
    eventName: "export_requested",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `export_requested:ics:trusted-upcoming:${contextAuth.organizationId}:${events.length}`,
    properties: {
      format: "ics",
      export_scope: "trusted_upcoming_notice_deadlines",
      event_count: events.length
    }
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="noticecontrol-trusted-upcoming-deadlines.ics"'
    }
  });
}
