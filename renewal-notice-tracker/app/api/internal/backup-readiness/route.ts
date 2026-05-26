import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildBackupReadinessEvidence } from "@/lib/commercial/privacy-operations";
import {
  createRouteHandler,
  parseJsonBody,
  requireInternalRouteAuth,
  RouteHttpError,
  routeServerError,
  routeValidationError
} from "@/lib/http";
import { checkedPrivilegedWrite } from "@/lib/supabase/checked-write";

export const POST = createRouteHandler(
  {
    auth: requireInternalRouteAuth("operations"),
    parse: async ({ request }) => {
      const body = await parseJsonBody<{
        status?: string;
        environment?: string;
        summary?: string;
        restore_tested_at?: string | null;
        trigger?: string;
        failures?: string[];
      }>(request, {
        code: "ERR_BACKUP_READINESS_REQUEST_001"
      });

      if (!body.status) {
        throw routeValidationError(
          "Backup readiness status is required.",
          "ERR_BACKUP_READINESS_REQUEST_002"
        );
      }

      return {
        ...body,
        status: body.status
      };
    },
    mapError: (error) =>
      error instanceof RouteHttpError
        ? null
        : error instanceof Error
        ? routeServerError(
            "Backup readiness check failed.",
            "ERR_BACKUP_READINESS_FAILED_001"
          )
        : null
  },
  async ({ input, json }) => {
    const admin = createAdminSupabaseClient();
    await checkedPrivilegedWrite(
      admin.from("backup_readiness_checks").insert({
        environment: input.environment ?? "production",
        status: input.status,
        summary: input.summary ?? null,
        restore_tested_at: input.restore_tested_at ?? null,
        evidence_json: buildBackupReadinessEvidence({
          trigger: input.trigger ?? "manual",
          failures: input.failures ?? []
        })
      }),
      {
        operation: "insert",
        table: "backup_readiness_checks",
        context: "internal_backup_readiness"
      }
    );

    return json({ ok: true }, { status: 200 });
  }
);
