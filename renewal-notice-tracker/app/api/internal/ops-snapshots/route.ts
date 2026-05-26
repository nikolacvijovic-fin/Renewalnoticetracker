import { refreshInternalRescueSnapshot } from "@/lib/internal/ops-queries";
import {
  createRouteHandler,
  requireInternalRouteAuth,
  RouteHttpError,
  routeServerError
} from "@/lib/http";

function getIdempotencyState(idempotencyKey: string | null) {
  if (!idempotencyKey) return null;
  const bucket = new Date().toISOString().slice(0, 16);
  return `${idempotencyKey}:${bucket}`;
}

export const POST = createRouteHandler(
  {
    auth: requireInternalRouteAuth("operations"),
    mapError: (error) =>
      error instanceof RouteHttpError
        ? null
        : error instanceof Error
        ? routeServerError(
            "Ops snapshot refresh failed.",
            "ERR_OPS_SNAPSHOT_FAILED_001"
          )
        : null
  },
  async ({ request, json, audit }) => {
    const idempotencyState = getIdempotencyState(request.headers.get("x-idempotency-key"));
    const organizationId = request.headers.get("x-organization-id");
    const payload = organizationId ? await refreshInternalRescueSnapshot(organizationId) : null;
    if (organizationId) {
      await audit({
        organizationId,
        action: "internal.ops_snapshots_refreshed",
        entityType: "operations",
        details: {
          idempotency_state: idempotencyState,
          rescue_snapshot: payload
        }
      });
    }

    return json({
      ok: true,
      idempotencyState,
      organizationId: organizationId ?? null,
      rescue: payload
    });
  }
);
