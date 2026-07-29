import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS,
  PRODUCT_EVENT_TAXONOMY
} from "@/lib/product/event-taxonomy";

const negotiationEvents = [
  "negotiation_brief.created",
  "negotiation_brief.recomputed",
  "negotiation_brief.submitted_for_review",
  "negotiation_brief.approved",
  "negotiation_brief.rejected",
  "negotiation_brief.archived",
  "negotiation_brief.evidence_attached",
  "vendor_communication_draft.created",
  "vendor_communication_draft.regenerated",
  "vendor_communication_draft.submitted_for_approval",
  "vendor_communication_draft.approved_for_copy",
  "vendor_communication_draft.rejected",
  "vendor_communication_draft.archived",
  "negotiation_playbook_item.created"
] as const;

describe("negotiation workflow audit taxonomy", () => {
  it("registers every emitted negotiation workflow audit event", () => {
    for (const eventName of negotiationEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry, eventName).toBeDefined();
      expect(entry.emittedToday).toBe(true);
      expect(entry.type).toBe("audit");
      expect(entry.source).toBe("lib/negotiation-workflow/negotiation-workflow.ts");
      expect(entry.owningProductModule).toBe("financial_exposure_intelligence");
    }
  });

  it("documents every event in the taxonomy and workflow guide", () => {
    const taxonomyDocs = readFileSync(join(process.cwd(), "docs/EVENT_TAXONOMY.md"), "utf8");
    const workflowDocs = readFileSync(
      join(process.cwd(), "docs/AI_NEGOTIATION_BRIEF_AND_VENDOR_COMMUNICATION.md"),
      "utf8"
    );

    for (const eventName of negotiationEvents) {
      expect(taxonomyDocs, eventName).toContain(eventName);
      expect(workflowDocs, eventName).toContain(eventName);
    }
  });

  it("allows only safe metadata and keeps raw content fields forbidden", () => {
    for (const eventName of negotiationEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry.privacySensitivity).toBe("high");
      expect(entry.safeMetadataFields).toEqual(
        expect.arrayContaining([
          "briefId",
          "draftId",
          "commercialDecisionId",
          "contractId",
          "strategy",
          "previousStatus",
          "newStatus",
          "confidenceScore",
          "blockerCodes",
          "warningCodes",
          "approvalActor"
        ])
      );
      expect(entry.forbiddenMetadataFields).toEqual(PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS);
      expect(entry.safeMetadataFields).not.toEqual(
        expect.arrayContaining(["raw_contract_text", "raw_quote_text", "ocr_output", "generated_email_body", "provider_payload"])
      );
    }
  });
});
