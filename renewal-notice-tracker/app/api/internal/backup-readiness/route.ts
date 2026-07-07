import { buildBackupReadinessEvidence } from "@/lib/commercial/privacy-operations";
import {
  createRouteHandler,
  parseJsonBody,
  requireInternalRouteAuth,
  RouteHttpError,
  routeServerError,
  routeValidationError
} from "@/lib/http";
import { insertBackupReadinessCheck } from "@/lib/internal/repositories/admin-ops-evidence-repository";

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
    await insertBackupReadinessCheck({
      environment: input.environment ?? "production",
      status: input.status,
      summary: input.summary ?? null,
      restoreTestedAt: input.restore_tested_at ?? null,
      evidence: buildBackupReadinessEvidence({
        trigger: input.trigger ?? "manual",
        failures: input.failures ?? []
      }),
      context: "internal_backup_readiness"
    });

    return json({ ok: true }, { status: 200 });
  }
);
