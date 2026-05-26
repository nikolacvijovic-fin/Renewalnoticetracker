import {
  WorkspaceDeletionExecutionError,
  executeWorkspaceDeletionRequest
} from "@/lib/organization/workspace-deletion";
import {
  createRouteHandler,
  requireDestructiveInternalRouteAuth,
  routeConflictError,
  routeNotFoundError,
  routeServerError,
  routeValidationError
} from "@/lib/http";

export const POST = createRouteHandler(
  {
    auth: requireDestructiveInternalRouteAuth(),
    parse: async ({ request }) => {
      const rawBody = await request.text();
      let body: { request_id?: string };
      try {
        body = JSON.parse(rawBody) as { request_id?: string };
      } catch {
        throw routeValidationError(
          "Invalid request body.",
          "ERR_WORKSPACE_DELETION_REQUEST_001"
        );
      }

      if (!body.request_id) {
        throw routeValidationError(
          "Deletion request id is required.",
          "ERR_WORKSPACE_DELETION_REQUEST_002"
        );
      }

      return {
        request_id: body.request_id
      };
    },
    mapError: (error) => {
      if (error instanceof WorkspaceDeletionExecutionError) {
        return routeServerError(
          "Workspace deletion failed.",
          "ERR_WORKSPACE_DELETION_FAILED_001"
        );
      }

      const message = error instanceof Error ? error.message : "";
      if (message === "Deletion request not found.") {
        return routeNotFoundError(
          "Deletion request not found.",
          "ERR_WORKSPACE_DELETION_NOT_FOUND_001"
        );
      }
      if (message === "Deletion request is not executable.") {
        return routeConflictError(
          "Deletion request is not executable.",
          "ERR_WORKSPACE_DELETION_STATE_INVALID_001"
        );
      }

      return null;
    }
  },
  async ({ input, json }) => {
    const result = await executeWorkspaceDeletionRequest(input.request_id);
    return json({ ok: true, result }, { status: 200 });
  }
);
