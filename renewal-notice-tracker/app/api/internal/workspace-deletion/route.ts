import { NextResponse } from "next/server";
import {
  WorkspaceDeletionExecutionError,
  executeWorkspaceDeletionRequest
} from "@/lib/organization/workspace-deletion";
import { hasValidDestructiveInternalRequestAuth } from "@/lib/internal-route-auth";

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!hasValidDestructiveInternalRequestAuth(request, rawBody)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody) as { request_id?: string };
    if (!body.request_id) {
      return NextResponse.json({ error: "Deletion request id is required." }, { status: 400 });
    }

    const result = await executeWorkspaceDeletionRequest(body.request_id);
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (error instanceof WorkspaceDeletionExecutionError) {
      return NextResponse.json({ error: "Workspace deletion failed." }, { status: 500 });
    }

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
