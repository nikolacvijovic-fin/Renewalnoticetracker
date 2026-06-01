import { createRouteHandler } from "@/lib/http";

export const POST = createRouteHandler(
  {},
  ({ json }) =>
    json(
      { error: "Legacy billing webhook disabled in shipped-first runtime." },
      { status: 410 }
    )
);
