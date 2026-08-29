import {
  createRouteHandler,
  requireOrganizationRouteAuth,
  routeNotFoundError,
  routeValidationError
} from "@/lib/http";
import { getBackgroundContractExportRequestStatus } from "@/lib/contracts/background-exports";

type ExportStatusRouteContext = {
  params: Promise<{ id?: string }>;
};

async function getRequestIdFromRouteContext(routeContext: ExportStatusRouteContext | undefined) {
  const params = await routeContext?.params;
  return params?.id?.trim() ?? "";
}

export const GET = createRouteHandler(
  {
    auth: requireOrganizationRouteAuth<ExportStatusRouteContext>(),
    parse: async ({ routeContext }) => {
      const id = await getRequestIdFromRouteContext(routeContext);
      if (!id) {
        throw routeValidationError(
          "Export request ID is required.",
          "ERR_EXPORT_REQUEST_ID_REQUIRED_001"
        );
      }
      return { id };
    }
  },
  async ({ auth, input, json }) => {
    const status = await getBackgroundContractExportRequestStatus({
      organizationId: auth.organizationId,
      requestId: input.id
    });

    if (!status) {
      throw routeNotFoundError("Export request was not found.", "ERR_EXPORT_REQUEST_NOT_FOUND_001");
    }

    return json(status);
  }
);
