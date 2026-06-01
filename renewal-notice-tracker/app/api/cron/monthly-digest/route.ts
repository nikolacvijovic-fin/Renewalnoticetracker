import { createRouteHandler } from "@/lib/http";

export const POST = createRouteHandler(
  {},
  ({ json }) =>
    json(
      { error: "Monthly digest is deferred from shipped-first runtime." },
      { status: 410 }
    )
);
