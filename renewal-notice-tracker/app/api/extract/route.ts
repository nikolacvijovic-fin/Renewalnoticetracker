import {
  createRouteHandler,
  parseJsonBody,
  requireShippedActionRouteAuth,
  routeValidationError,
  routeServerError
} from "@/lib/http";
import { extractContractMetadata } from "@/lib/ai/extract-contract";

export const POST = createRouteHandler(
  {
    auth: requireShippedActionRouteAuth("preview_extraction", {
      deniedAuditAction: "contracts.extraction_preview_denied",
      deniedEntityType: "contract_preview",
      deniedDetails: () => ({
        source: "api_extract"
      })
    }),
    parse: async ({ request }) => {
      const body = await parseJsonBody<{ documentText?: unknown }>(request, {
        code: "ERR_IMPORT_PARSE_001"
      });
      const documentText = String(body?.documentText ?? "");

      if (!documentText.trim()) {
        throw routeValidationError("Invalid request.", "ERR_IMPORT_PARSE_002");
      }

      return { documentText };
    }
  },
  async ({ auth: context, input, audit, json }) => {
    try {
      const result = await extractContractMetadata(input.documentText);
      await audit({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        action: "contracts.extraction_preview_requested",
        entityType: "contract_preview",
        details: {
          source: "api_extract",
          character_count: input.documentText.length
        }
      });
      return json(result);
    } catch {
      throw routeServerError("Extraction failed.", "ERR_IMPORT_EXTRACTION_001");
    }
  }
);
