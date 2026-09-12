import {
  BackgroundExportDownloadError,
  downloadBackgroundContractExportArtifact
} from "@/lib/contracts/background-exports";
import {
  createRouteHandler,
  requireOrganizationRouteAuth,
  routeValidationError,
  RouteHttpError
} from "@/lib/http";

type ExportDownloadRouteContext = {
  params: Promise<{ id?: string }>;
};

async function getRequestIdFromRouteContext(routeContext: ExportDownloadRouteContext | undefined) {
  const params = await routeContext?.params;
  return params?.id?.trim() ?? "";
}

export const GET = createRouteHandler(
  {
    auth: requireOrganizationRouteAuth<ExportDownloadRouteContext>(),
    parse: async ({ routeContext }) => {
      const id = await getRequestIdFromRouteContext(routeContext);
      if (!id) {
        throw routeValidationError(
          "Export request ID is required.",
          "ERR_EXPORT_REQUEST_ID_REQUIRED_001"
        );
      }
      return { id };
    },
    mapError: (error) => {
      if (error instanceof BackgroundExportDownloadError) {
        return new RouteHttpError(error.message, {
          code: error.code,
          status: error.status
        });
      }
      return null;
    }
  },
  async ({ auth, input }) => {
    const artifact = await downloadBackgroundContractExportArtifact({
      organizationId: auth.organizationId,
      actorUserId: auth.user.id,
      requestId: input.id
    });

    return new Response(new Uint8Array(artifact.body), {
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Length": String(artifact.artifactSizeBytes),
        "Content-Disposition": `attachment; filename="${artifact.filename}"`,
        "Cache-Control": "private, no-store"
      }
    });
  }
);
