import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { sanitizeInternalError } from "@/lib/errors";
import { getAppConfig } from "@/lib/config";
import { resolveSafeAuthRedirect } from "@/lib/auth/safe-auth-redirect";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = resolveSafeAuthRedirect(requestUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, request.url));

  if (code) {
    const config = getAppConfig();
    const supabase = createServerClient(
      config.supabase.url,
      config.supabase.anonKey,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set({ name, value: "", ...options, maxAge: 0 });
          }
        }
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth?message=${encodeURIComponent(sanitizeInternalError(error))}`, request.url)
      );
    }
  }

  return response;
}
