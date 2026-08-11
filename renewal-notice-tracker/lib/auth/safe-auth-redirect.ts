import { resolveSafeAppRedirectPath } from "@/lib/auth-guards";

export function resolveSafeAuthRedirect(next: string | null | undefined) {
  return resolveSafeAppRedirectPath(next, "/dashboard");
}
