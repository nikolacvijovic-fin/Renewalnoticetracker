import { NextResponse } from "next/server";
import { uploadSaasOptOutClockPdfAction } from "@/lib/actions/contracts/upload";
import {
  assertCanUseShippedAction,
  getOrganizationContextOrNull
} from "@/lib/auth";
import type { PdfContractUploadActionResult } from "@/lib/contracts/pdf-upload";
import { normalizePdfUploadAttemptId } from "@/lib/contracts/pdf-upload";
import { getScopedPdfUploadAttemptResult } from "@/lib/contracts/pdf-upload-attempts";

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
