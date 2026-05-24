import { NextResponse } from "next/server";
import { hasValidInternalRouteSecret } from "@/lib/internal-route-auth";

export async function GET(request: Request) {
  if (!hasValidInternalRouteSecret(request, "health")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, mode: "secret-check" });
}
