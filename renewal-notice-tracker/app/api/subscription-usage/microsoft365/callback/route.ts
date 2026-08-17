import { NextResponse } from "next/server";
import { completeMicrosoft365AdminConsent } from "@/lib/actions/subscription-usage-optimization";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const tenantId = url.searchParams.get("tenant") ?? "";
  const adminConsent = String(url.searchParams.get("admin_consent") ?? "").toLowerCase() === "true";

  try {
    await completeMicrosoft365AdminConsent({
      state,
      tenantId,
      tenantName: tenantId,
      adminConsent
    });
    return NextResponse.redirect(new URL("/dashboard/subscription-optimization?connected=microsoft365", request.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard/subscription-optimization?connection_error=microsoft365", request.url));
  }
}
