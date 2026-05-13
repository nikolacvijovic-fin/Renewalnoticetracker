import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { refreshOperationalSnapshots } from "@/lib/internal/ops-queries";
import { createAuditLog } from "@/lib/audit";

function getIdempotencyState(idempotencyKey: string | null) {
  if (!idempotencyKey) return null;
  const bucket = new Date().toISOString().slice(0, 16);
  return `${idempotencyKey}:${bucket}`;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-health-secret");
  if (secret !== env.INTERNAL_HEALTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyState = getIdempotencyState(request.headers.get("x-idempotency-key"));
  const organizationId = request.headers.get("x-organization-id");

  try {
    const payload = await refreshOperationalSnapshots(organizationId, {
      jobKey: request.headers.get("x-idempotency-key")
    });
    if (organizationId) {
      await createAuditLog({
        organizationId,
        action: "internal.ops_snapshots_refreshed",
        entityType: "operations",
        details: {
          idempotency_state: idempotencyState,
          reused_snapshot_set: payload.reused,
          readiness_score: payload.readiness.overallScore,
          capacity_score: payload.capacity.overallScore
        }
      });
    }

    return NextResponse.json({
      ok: true,
      idempotencyState,
      reused: payload.reused,
      readiness: {
        score: payload.readiness.overallScore,
        confidence: payload.readiness.confidenceScore
      },
      capacity: {
        score: payload.capacity.overallScore,
        confidence: payload.capacity.confidenceScore
      },
      alerts: payload.alerts.length
    });
  } catch {
    return NextResponse.json({ error: "Ops snapshot refresh failed." }, { status: 500 });
  }
}
