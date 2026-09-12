import { NextResponse } from "next/server";
import {
  retrySaasOptOutClockPdfExtractionAction,
  uploadSaasOptOutClockPdfAction
} from "@/lib/actions/contracts/upload";
import {
  assertCanUseShippedAction,
  getOrganizationContextOrNull
} from "@/lib/auth";
import type { PdfContractUploadActionResult } from "@/lib/contracts/pdf-upload";
import { normalizePdfUploadAttemptId } from "@/lib/contracts/pdf-upload";
import {
  abandonScopedPdfUploadAttempt,
  getScopedPdfUploadAttemptResult
} from "@/lib/contracts/pdf-upload-attempts";

export const runtime = "nodejs";

function json(result: PdfContractUploadActionResult, status: number) {
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: Request) {
  const context = await getOrganizationContextOrNull();
  if (!context) {
    return json(
      {
        ok: false,
        errorCode: "authentication_required",
        safeMessage: "Sign in and select an organization before uploading contracts."
      },
      401
    );
  }

  try {
    await assertCanUseShippedAction(context, "upload_import");
    if (!["admin", "operator"].includes(context.role)) throw new Error("role_denied");
  } catch {
    return json(
      {
        ok: false,
        errorCode: "permission_denied",
        safeMessage: "Your organization role cannot upload contracts."
      },
      403
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json(
      {
        ok: false,
        errorCode: "invalid_file_type",
        safeMessage: "Choose a valid PDF contract and try again."
      },
      400
    );
  }

  const result = await uploadSaasOptOutClockPdfAction(formData);
  if (result.ok) {
    return json(result, result.extractionStatus === "processing" ? 202 : 200);
  }

  const status = result.errorCode === "contract_limit_reached"
    ? 409
    : result.errorCode === "permission_denied"
      ? 403
      : result.errorCode === "upload_already_processing"
        ? 409
        : 400;
  return json(result, status);
}

export async function GET(request: Request) {
  const context = await getOrganizationContextOrNull();
  if (!context) {
    return json({
      ok: false,
      errorCode: "authentication_required",
      safeMessage: "Sign in and select an organization to recover this upload."
    }, 401);
  }

  const attemptId = normalizePdfUploadAttemptId(new URL(request.url).searchParams.get("attemptId"));
  if (!attemptId) {
    return json({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "A valid PDF upload attempt identifier is required."
    }, 400);
  }

  const result = await getScopedPdfUploadAttemptResult({
    organizationId: context.organizationId,
    uploadAttemptId: attemptId,
    recovered: true
  });

  if (!result) {
    return json({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "This PDF upload is not available in the active organization."
    }, 404);
  }

  if (!result.ok) return json(result, 409);
  return json(result, result.extractionStatus === "processing" ? 202 : 200);
}

export async function DELETE(request: Request) {
  const context = await getOrganizationContextOrNull();
  if (!context) {
    return NextResponse.json({
      ok: false,
      code: "authentication_required",
      message: "Sign in and select an organization to abandon this upload."
    }, { status: 401 });
  }

  try {
    await assertCanUseShippedAction(context, "upload_import");
    if (!["admin", "operator"].includes(context.role)) throw new Error("role_denied");
  } catch {
    return NextResponse.json({
      ok: false,
      code: "permission_denied",
      message: "Only an admin or operator can abandon a PDF upload."
    }, { status: 403 });
  }

  const attemptId = normalizePdfUploadAttemptId(new URL(request.url).searchParams.get("attemptId"));
  if (!attemptId) {
    return NextResponse.json({
      ok: false,
      code: "invalid_upload_attempt",
      message: "A valid PDF upload attempt identifier is required."
    }, { status: 400 });
  }

  try {
    const result = await abandonScopedPdfUploadAttempt({
      organizationId: context.organizationId,
      uploadAttemptId: attemptId
    });
    return NextResponse.json({ ok: true, ...result }, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({
      ok: false,
      code: "upload_abandon_blocked",
      message: "This upload cannot be abandoned because it is unavailable or has reached review."
    }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const context = await getOrganizationContextOrNull();
  if (!context) {
    return json({
      ok: false,
      errorCode: "authentication_required",
      safeMessage: "Sign in and select an organization to retry extraction."
    }, 401);
  }

  try {
    await assertCanUseShippedAction(context, "upload_import");
    if (!["admin", "operator"].includes(context.role)) throw new Error("role_denied");
  } catch {
    return json({
      ok: false,
      errorCode: "permission_denied",
      safeMessage: "Only an admin or operator can retry PDF extraction."
    }, 403);
  }

  const attemptId = normalizePdfUploadAttemptId(new URL(request.url).searchParams.get("attemptId"));
  if (!attemptId) {
    return json({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "A valid PDF upload attempt identifier is required."
    }, 400);
  }

  const result = await retrySaasOptOutClockPdfExtractionAction(attemptId);
  if (!result.ok) return json(result, result.errorCode === "permission_denied" ? 403 : 409);
  return json(result, result.extractionStatus === "processing" ? 202 : 200);
}
