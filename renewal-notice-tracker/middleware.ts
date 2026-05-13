import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  shouldRedirectAwayFromAuth,
  shouldRedirectToAuth
} from "@/lib/auth-guards";
import { env } from "@/lib/env";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

  const {
    data: { session }
  } = await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;

  if (shouldRedirectToAuth(pathname, Boolean(session))) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  if (shouldRedirectAwayFromAuth(pathname, Boolean(session))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
