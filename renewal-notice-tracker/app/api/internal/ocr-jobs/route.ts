import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processPendingOcrJobs } from "@/lib/ocr/jobs";

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-health-secret");
  if (secret !== env.INTERNAL_HEALTH_SECRET) {
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
