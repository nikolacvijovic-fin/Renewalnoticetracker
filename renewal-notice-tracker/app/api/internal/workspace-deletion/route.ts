import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { executeWorkspaceDeletionRequest } from "@/lib/organization/workspace-deletion";

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-health-secret");
  if (secret !== env.INTERNAL_HEALTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { request_id?: string };
    if (!body.request_id) {
      return NextResponse.json({ error: "Deletion request id is required." }, { status: 400 });
    }

    const result = await executeWorkspaceDeletionRequest(body.request_id);
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace deletion failed.";
    if (message === "Deletion request not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message === "Deletion request is not executable.") {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: "Workspace deletion failed." }, { status: 500 });
  }
}
