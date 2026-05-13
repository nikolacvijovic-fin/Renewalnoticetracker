import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { extractContractMetadata } from "@/lib/ai/extract-contract";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await getActiveOrganizationContextOrNull();
  let context;
  try {
    context = await assertCanUseShippedAction(auth, "preview_extraction", {
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "contracts.extraction_preview_denied",
          entityType: "contract_preview",
          details: {
            source: "api_extract",
            denied_action: action,
            denied_reason: reason
          }
        });
      }
    });
  } catch (error) {
    if (error instanceof ActiveOrganizationRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof OrganizationAuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const documentText = String(
    (body as { documentText?: unknown } | null)?.documentText ?? ""
  );

  if (!documentText.trim()) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await extractContractMetadata(documentText);
    await createAuditLog({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "contracts.extraction_preview_requested",
      entityType: "contract_preview",
      details: {
        source: "api_extract",
        character_count: documentText.length
      }
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Extraction failed." }, { status: 500 });
  }
}
