import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  const secret = request.headers.get("x-internal-health-secret");
  if (secret !== env.INTERNAL_HEALTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, mode: "secret-check" });
}
