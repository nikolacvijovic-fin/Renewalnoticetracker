import { NextResponse } from "next/server";
import { getOrganizationContextOrNull } from "@/lib/auth";
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

function isRiskExplanationAuditSurface(value: unknown): value is RiskExplanationAuditSurface {
  return value === "contract_detail" || value === "contracts_table" || value === "risk_queue";
}

function isRiskConfidenceLevel(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const context = await getOrganizationContextOrNull();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      sourceSurface?: unknown;
      riskBand?: unknown;
      confidenceLevel?: unknown;
      reasonCount?: unknown;
      warningCount?: unknown;
      calculationVersion?: unknown;
      inputDataVersion?: unknown;
    };

    if (
      !isRiskExplanationAuditSurface(body.sourceSurface) ||
      typeof body.riskBand !== "string" ||
      !isRiskConfidenceLevel(body.confidenceLevel) ||
      typeof body.reasonCount !== "number" ||
      typeof body.warningCount !== "number" ||
      typeof body.calculationVersion !== "string" ||
      typeof body.inputDataVersion !== "string"
    ) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const contract = await getContractRiskAuditContext(params.id, context.organizationId);
    if (!contract) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
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

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (
      error instanceof IntelligenceAuthorizationError ||
      error instanceof IntelligencePlanAccessError
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Risk explanation audit failed." }, { status: 500 });
  }
}
