import { NextResponse } from "next/server";
import {
  ActiveOrganizationRequiredError,
  ActiveOrganizationScopeError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { getContractCalendarEvents, requireScopedContract } from "@/lib/contracts/kernel-queries";
import { buildCalendar } from "@/lib/contracts/ics";
import { createAuditLog } from "@/lib/audit";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = await getActiveOrganizationContextOrNull();
  let contextAuth;
  try {
    contextAuth = await assertCanUseShippedAction(auth, SHIPPED_EXPORT_CLASSIFICATION.ics.action, {
      organizationId: auth?.organizationId ?? null,
      assertScoped: async (organizationId) => {
        await requireScopedContract(id, organizationId);
      },
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          contractId: id,
          action: "contract.ics_export_denied",
          entityType: "export",
          details: {
            export_classification: "baseline_ics",
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
    if (error instanceof ActiveOrganizationScopeError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    throw error;
  }
  const events = await getContractCalendarEvents(id, contextAuth.organizationId);

  const ics = buildCalendar(events);

  await createAuditLog({
    organizationId: contextAuth.organizationId,
    actorUserId: contextAuth.user.id,
    contractId: id,
    action: SHIPPED_EXPORT_CLASSIFICATION.ics.auditAction,
    entityType: "export",
    details: { event_count: events.length, export_classification: "baseline_ics" }
  });

  await trackServerAnalyticsEvent({
    organizationId: contextAuth.organizationId,
    actorUserId: contextAuth.user.id,
    eventName: "export_requested",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `export_requested:ics:${id}:${events.length}`,
    properties: {
      format: "ics",
      contract_id: id,
      event_count: events.length
    }
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="noticecontrol-contract-${id}.ics"`
    }
  });
}
