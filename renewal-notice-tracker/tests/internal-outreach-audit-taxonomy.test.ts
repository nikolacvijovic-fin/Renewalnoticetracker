import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS,
  PRODUCT_EVENT_TAXONOMY
} from "@/lib/product/event-taxonomy";

const internalOutreachEvents = [
  "internal_outreach_opportunity.detected",
  "internal_outreach_opportunity.created",
  "internal_outreach_opportunity.recomputed",
  "internal_outreach_opportunity.dismissed",
  "internal_outreach_opportunity.archived",
  "internal_outreach.evidence_attached",
  "internal_outreach_draft.created",
  "internal_outreach_draft.regenerated",
  "internal_outreach_draft.submitted_for_approval",
  "internal_outreach_draft.approved_for_copy",
  "internal_outreach_draft.rejected",
  "internal_outreach_draft.archived",
  "internal_outreach_suppression.created",
  "internal_outreach_playbook_item.created",
  "internal_outreach.safety_blocked",
  "internal_outreach.priority_scored",
  "internal_outreach.audience_resolved",
  "internal_outreach.sequence_planned",
  "internal_outreach.crm_note_generated",
  "internal_outreach.safety_reviewed",
  "internal_outreach.duplicate_dismissed"
] as const;

describe("internal outreach audit taxonomy", () => {
  it("registers every emitted internal outreach audit event", () => {
    for (const eventName of internalOutreachEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry, eventName).toBeDefined();
      expect(entry.emittedToday).toBe(true);
      expect(entry.type).toBe("audit");
      expect(entry.source).toBe("lib/internal-outreach-intelligence/internal-outreach-intelligence.ts");
      expect(entry.owningProductModule).toBe("financial_exposure_intelligence");
    }
  });

  it("documents every event in the taxonomy and internal outreach guide", () => {
    const taxonomyDocs = readFileSync(join(process.cwd(), "docs/EVENT_TAXONOMY.md"), "utf8");
    const outreachDocs = readFileSync(
      join(process.cwd(), "docs/INTERNAL_COLD_OUTREACH_REVENUE_INTELLIGENCE.md"),
      "utf8"
    );

    for (const eventName of internalOutreachEvents) {
      expect(taxonomyDocs, eventName).toContain(eventName);
      expect(outreachDocs, eventName).toContain(eventName);
    }
  });

  it("allows only safe metadata and forbids raw customer/provider content", () => {
    for (const eventName of internalOutreachEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry.privacySensitivity).toBe("high");
      expect(entry.safeMetadataFields).toEqual(
        expect.arrayContaining([
          "opportunityId",
          "draftId",
          "contractId",
          "commercialDecisionId",
          "negotiationBriefId",
          "opportunityType",
          "audience",
          "channel",
          "priority",
          "safetyStatus",
          "priorityScore",
          "priorityBand",
          "audienceRole",
          "sequenceStepCount",
          "syncStatus",
          "approvalActor"
        ])
      );
      expect(entry.forbiddenMetadataFields).toEqual(PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS);
      expect(entry.safeMetadataFields).not.toEqual(
        expect.arrayContaining(["raw_contract_text", "full_notes", "ocr_output", "email_body", "provider_payload"])
      );
    }
  });
});
