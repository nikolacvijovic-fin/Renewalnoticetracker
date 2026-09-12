import { createRouteHandler, RouteHttpError, routeServerError } from "@/lib/http";
import { requireSignedWorkerRouteAuth } from "@/lib/background-jobs/worker-auth";
import { cleanupStalePdfUploadAttempts } from "@/lib/contracts/pdf-upload-cleanup";

export const runtime = "nodejs";

export const POST = createRouteHandler(
  {
    auth: ({ request }) => requireSignedWorkerRouteAuth(request),
    mapError: (error) =>
      error instanceof RouteHttpError
        ? null
        : routeServerError(
            "PDF upload cleanup could not be completed.",
            "ERR_PDF_UPLOAD_CLEANUP_FAILED_001"
          )
  },
  async ({ json }) => json(await cleanupStalePdfUploadAttempts())
);
