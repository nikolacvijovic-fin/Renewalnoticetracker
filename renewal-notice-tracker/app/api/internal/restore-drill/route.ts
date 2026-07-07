import { buildRestoreDrillEvidence } from "@/lib/commercial/privacy-operations";
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
        summary?: string;
        trigger?: string;
        scope?: string;
        recovery_time_minutes?: number | null;
        failures?: string[];
        tested_at?: string | null;
        outcome?: "passed" | "failed";
      }>(request, {
        code: "ERR_RESTORE_DRILL_REQUEST_001"
      });

      if (!body.outcome) {
        throw routeValidationError(
          "Restore drill outcome is required.",
          "ERR_RESTORE_DRILL_REQUEST_002"
        );
      }

      return {
        ...body,
        outcome: body.outcome
      };
    },
    mapError: (error) =>
      error instanceof RouteHttpError
        ? null
        : error instanceof Error
        ? routeServerError(
            "Restore drill recording failed.",
            "ERR_RESTORE_DRILL_FAILED_001"
          )
        : null
  },
  async ({ input, json }) => {
    const testedAt = input.tested_at ?? new Date().toISOString();

    await insertBackupReadinessCheck({
      environment: "production",
      status: input.outcome === "passed" ? "healthy" : "failed",
      summary: input.summary ?? `Restore drill ${input.outcome}.`,
      restoreTestedAt: testedAt,
      evidence: buildRestoreDrillEvidence({
        trigger: input.trigger ?? "manual",
        outcome: input.outcome,
        scope: input.scope ?? "workspace_restore",
        recoveryTimeMinutes: input.recovery_time_minutes ?? null,
        failures: input.failures ?? []
      }),
      context: "internal_restore_drill"
    });

    return json({ ok: true, restore_tested_at: testedAt }, { status: 200 });
  }
);
