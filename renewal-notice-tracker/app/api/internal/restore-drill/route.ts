import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildRestoreDrillEvidence } from "@/lib/commercial/privacy-operations";
import { hasValidInternalRouteSecret } from "@/lib/internal-route-auth";
import { checkedPrivilegedWrite } from "@/lib/supabase/checked-write";

export async function POST(request: Request) {
  if (!hasValidInternalRouteSecret(request, "operations")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      summary?: string;
      trigger?: string;
      scope?: string;
      recovery_time_minutes?: number | null;
      failures?: string[];
      tested_at?: string | null;
      outcome?: "passed" | "failed";
    };

    if (!body.outcome) {
      return NextResponse.json({ error: "Restore drill outcome is required." }, { status: 400 });
    }

    const testedAt = body.tested_at ?? new Date().toISOString();
    const admin = createAdminSupabaseClient();

    await checkedPrivilegedWrite(
      admin.from("backup_readiness_checks").insert({
        environment: "production",
        status: body.outcome === "passed" ? "healthy" : "failed",
        summary: body.summary ?? `Restore drill ${body.outcome}.`,
        restore_tested_at: testedAt,
        evidence_json: buildRestoreDrillEvidence({
          trigger: body.trigger ?? "manual",
          outcome: body.outcome,
          scope: body.scope ?? "workspace_restore",
          recoveryTimeMinutes: body.recovery_time_minutes ?? null,
          failures: body.failures ?? []
        })
      }),
      {
        operation: "insert",
        table: "backup_readiness_checks",
        context: "internal_restore_drill"
      }
    );

    return NextResponse.json({ ok: true, restore_tested_at: testedAt }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Restore drill recording failed." }, { status: 500 });
  }
}
