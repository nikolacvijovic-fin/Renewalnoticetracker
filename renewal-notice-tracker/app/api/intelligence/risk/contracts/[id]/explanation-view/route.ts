import {
  createRouteHandler,
  parseJsonBody,
  requireOrganizationRouteAuth,
  RouteHttpError,
  routeForbiddenError,
  routeNotFoundError,
  routeServerError,
  routeValidationError
} from "@/lib/http";
import type { ActiveOrganizationContext } from "@/lib/auth";
import { getContractRiskAuditContext } from "@/lib/contracts/kernel-queries";
import {
  assertCanAccessIntelligenceSurface,
  IntelligenceAuthorizationError,
  IntelligencePlanAccessError
} from "@/lib/intelligence/access";
import {
  auditRiskExplanationViewed,
  type RiskExplanationAuditSurface
} from "@/lib/intelligence/audit";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

function isRiskExplanationAuditSurface(value: unknown): value is RiskExplanationAuditSurface {
  return value === "contract_detail" || value === "contracts_table" || value === "risk_queue";
}

function isRiskConfidenceLevel(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

export const POST = createRouteHandler<
  ActiveOrganizationContext,
  {
    sourceSurface: RiskExplanationAuditSurface;
    riskBand: string;
    confidenceLevel: "low" | "medium" | "high";
    reasonCount: number;
    warningCount: number;
    calculationVersion: string;
    inputDataVersion: string;
  },
  { params: { id: string } }
>(
  {
    auth: requireOrganizationRouteAuth<{ params: { id: string } }>(),
    parse: async ({ request }) => {
      const body = await parseJsonBody<{
        sourceSurface?: unknown;
        riskBand?: unknown;
        confidenceLevel?: unknown;
        reasonCount?: unknown;
        warningCount?: unknown;
        calculationVersion?: unknown;
        inputDataVersion?: unknown;
      }>(request, {
        message: "Invalid request body.",
        code: "ERR_RISK_EXPLANATION_REQUEST_001"
      });

      if (
        !isRiskExplanationAuditSurface(body.sourceSurface) ||
        typeof body.riskBand !== "string" ||
        !isRiskConfidenceLevel(body.confidenceLevel) ||
        typeof body.reasonCount !== "number" ||
        typeof body.warningCount !== "number" ||
        typeof body.calculationVersion !== "string" ||
        typeof body.inputDataVersion !== "string"
      ) {
        throw routeValidationError(
          "Invalid request body.",
          "ERR_RISK_EXPLANATION_REQUEST_002"
        );
      }

      return body as {
        sourceSurface: RiskExplanationAuditSurface;
        riskBand: string;
        confidenceLevel: "low" | "medium" | "high";
        reasonCount: number;
        warningCount: number;
        calculationVersion: string;
        inputDataVersion: string;
      };
    },
    mapError: (error) => {
      if (
        error instanceof IntelligenceAuthorizationError ||
        error instanceof IntelligencePlanAccessError
      ) {
        return routeForbiddenError();
      }

      if (error instanceof RouteHttpError) {
        return null;
      }

      if (error instanceof Error) {
        return routeServerError(
          "Risk explanation audit failed.",
          "ERR_RISK_EXPLANATION_FAILED_001"
        );
      }

      return null;
    },
    instrumentation: {
      onError: ({ auth, input, requestId, url, normalizedError }) => {
        if (normalizedError.status !== 403) return;
        void emitOperationalEvent({
          eventName: "intelligence_access_denied",
          severity: "P3",
          sensitivity: "customer_sensitive",
          alert: false,
          route: url.pathname,
          organizationId: auth?.organizationId ?? null,
          actorUserId: auth?.user.id ?? null,
          requestId,
          metadata: {
            surface: "risk_explanation",
            source_surface: input?.sourceSurface ?? "unknown",
            status: normalizedError.status,
            code: normalizedError.code
          }
        });
      }
    }
  },
  async ({ auth: context, input: body, routeContext, noContent }) => {
    const contract = await getContractRiskAuditContext(
      routeContext!.params.id,
      context.organizationId
    );
    if (!contract) {
      throw routeNotFoundError();
    }

    await assertCanAccessIntelligenceSurface({
      context,
      surface: "risk_explanation",
      contractOwnerUserId: contract.owner_user_id
    });

    await auditRiskExplanationViewed({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      contractId: contract.id,
      sourceSurface: body.sourceSurface,
      riskBand: body.riskBand,
      lowConfidenceCount: body.confidenceLevel === "low" ? 1 : 0,
      reasonCount: body.reasonCount,
      warningCount: body.warningCount,
      calculationVersion: body.calculationVersion,
      inputDataVersion: body.inputDataVersion
    });

    return noContent();
  }
);
