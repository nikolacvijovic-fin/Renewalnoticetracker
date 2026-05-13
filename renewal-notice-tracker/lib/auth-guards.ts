const PUBLIC_PREFIXES = ["/", "/pricing", "/auth"];

export function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || (prefix !== "/" && pathname.startsWith(`${prefix}/`))
  );
}

export function shouldRedirectToAuth(pathname: string, isAuthenticated: boolean) {
  return !isAuthenticated && pathname.startsWith("/dashboard") && !isPublicPath(pathname);
}

export function shouldRedirectAwayFromAuth(pathname: string, isAuthenticated: boolean) {
  return isAuthenticated && pathname === "/auth";
}
