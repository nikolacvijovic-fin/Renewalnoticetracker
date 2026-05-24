import { NextResponse } from "next/server";
import { refreshInternalRescueSnapshot } from "@/lib/internal/ops-queries";
import { createAuditLog } from "@/lib/audit";
import { hasValidInternalRouteSecret } from "@/lib/internal-route-auth";

function getIdempotencyState(idempotencyKey: string | null) {
  if (!idempotencyKey) return null;
  const bucket = new Date().toISOString().slice(0, 16);
  return `${idempotencyKey}:${bucket}`;
}

export async function POST(request: Request) {
  if (!hasValidInternalRouteSecret(request, "operations")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyState = getIdempotencyState(request.headers.get("x-idempotency-key"));
  const organizationId = request.headers.get("x-organization-id");

  try {
    const payload = organizationId ? await refreshInternalRescueSnapshot(organizationId) : null;
    if (organizationId) {
      await createAuditLog({
        organizationId,
        action: "internal.ops_snapshots_refreshed",
        entityType: "operations",
        details: {
          idempotency_state: idempotencyState,
          rescue_snapshot: payload
        }
      });
    }

    return NextResponse.json({
      ok: true,
      idempotencyState,
      organizationId: organizationId ?? null,
      rescue: payload
    });
  } catch {
    return NextResponse.json({ error: "Ops snapshot refresh failed." }, { status: 500 });
  }
}
