import {
  createRouteHandler,
  requireInternalRouteAuth
} from "@/lib/http";

export const GET = createRouteHandler(
  {
    auth: requireInternalRouteAuth("health")
  },
  ({ json }) => json({ ok: true, mode: "secret-check" })
);
