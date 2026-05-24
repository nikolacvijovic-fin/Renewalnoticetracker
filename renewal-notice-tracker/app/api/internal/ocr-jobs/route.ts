import { NextResponse } from "next/server";
import { hasValidInternalRouteSecret } from "@/lib/internal-route-auth";
import { processPendingOcrJobs } from "@/lib/ocr/jobs";

export async function POST(request: Request) {
  if (!hasValidInternalRouteSecret(request, "ocr_jobs")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const results = await processPendingOcrJobs(body.limit ?? 5);
    return NextResponse.json({ results }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "OCR job processing failed." }, { status: 500 });
  }
}
