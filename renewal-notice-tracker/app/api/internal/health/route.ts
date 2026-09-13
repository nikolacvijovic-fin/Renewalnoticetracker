import {
  createRouteHandler,
  requireInternalRouteAuth
} from "@/lib/http";
import { probeDatabaseReadiness } from "@/lib/internal/repositories/admin-runtime-health-repository";

export const GET = createRouteHandler(
  {
    auth: requireInternalRouteAuth("health")
  },
  async ({ json, url }) => {
    if (url.searchParams.get("readiness") !== "1") {
      return json({ ok: true, mode: "secret-check" });
    }

    let databaseReady = false;
    try {
      databaseReady = await probeDatabaseReadiness();
    } catch {
      databaseReady = false;
    }

    if (!databaseReady) {
      return json(
        { ok: false, mode: "readiness", checks: { database: "failed" } },
        { status: 503 }
      );
    }

    return json({ ok: true, mode: "readiness", checks: { database: "ok" } });
  }
);
