import { NextResponse } from "next/server";
import { completeGoogleWorkspaceAuthorization } from "@/lib/actions/subscription-usage-optimization";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error");
  try {
    if (providerError) throw new Error("google_authorization_denied");
    await completeGoogleWorkspaceAuthorization({ state, code });
    return NextResponse.redirect(new URL("/dashboard/subscription-optimization?connected=google-workspace", request.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard/subscription-optimization?connection_error=google-workspace", request.url));
  }
}
