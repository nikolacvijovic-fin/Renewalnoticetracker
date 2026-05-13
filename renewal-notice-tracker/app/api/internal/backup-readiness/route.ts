import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildBackupReadinessEvidence } from "@/lib/commercial/privacy-operations";

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-health-secret");
  if (secret !== env.INTERNAL_HEALTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      status?: string;
      environment?: string;
      summary?: string;
      restore_tested_at?: string | null;
      trigger?: string;
      failures?: string[];
    };

    if (!body.status) {
      return NextResponse.json({ error: "Backup readiness status is required." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    await admin.from("backup_readiness_checks").insert({
      environment: body.environment ?? "production",
      status: body.status,
      summary: body.summary ?? null,
      restore_tested_at: body.restore_tested_at ?? null,
      evidence_json: buildBackupReadinessEvidence({
        trigger: body.trigger ?? "manual",
        failures: body.failures ?? []
      })
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Backup readiness check failed." }, { status: 500 });
  }
}
