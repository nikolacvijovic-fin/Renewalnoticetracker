import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS,
  PRODUCT_EVENT_TAXONOMY
} from "@/lib/product/event-taxonomy";

const commercialDecisionEvents = [
  "commercial_decision.created",
  "commercial_decision.recomputed",
  "commercial_decision.submitted_for_review",
  "commercial_decision.approved",
  "commercial_decision.rejected",
  "commercial_decision.finalized",
  "commercial_decision.archived",
  "commercial_decision.recommended_action_changed",
  "commercial_decision.negotiation_posture_changed",
  "commercial_decision.evidence_attached",
  "commercial_decision.evidence_refreshed",
  "commercial_decision.snapshot_created",
  "commercial_decision.approver_reassigned",
  "commercial_decision.approval_blocked",
  "commercial_decision.duplicate_create_resolved"
] as const;

describe("commercial decision audit taxonomy", () => {
  it("registers every workbench audit event as emitted by the service layer", () => {
    for (const eventName of commercialDecisionEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry, eventName).toBeDefined();
      expect(entry.emittedToday).toBe(true);
      expect(entry.type).toBe("audit");
      expect(entry.source).toBe("lib/commercial-decision-workbench/commercial-decision-workbench.ts");
    }
  });

  it("documents every commercial decision event", () => {
    const docs = readFileSync(join(process.cwd(), "docs/EVENT_TAXONOMY.md"), "utf8");
    const workbenchDocs = readFileSync(join(process.cwd(), "docs/COMMERCIAL_DECISION_WORKBENCH.md"), "utf8");

    for (const eventName of commercialDecisionEvents) {
      expect(docs, eventName).toContain(eventName);
      expect(workbenchDocs, eventName).toContain(eventName);
    }
  });

  it("uses safe metadata fields and keeps raw customer/provider payload fields forbidden", () => {
    for (const eventName of commercialDecisionEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry.privacySensitivity).toBe("high");
      expect(entry.safeMetadataFields).toEqual(
        expect.arrayContaining([
          "decision_id",
          "contract_id",
          "recommended_action",
          "negotiation_posture",
          "commercial_risk_level",
          "evidence_confidence",
          "assigned_approver_user_id",
          "acting_approver_user_id",
          "approval_authority_mode"
        ])
      );
      expect(entry.forbiddenMetadataFields).toEqual(PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS);
      expect(entry.safeMetadataFields).not.toEqual(
        expect.arrayContaining(["raw_contract_text", "raw_quote_text", "note_text", "provider_payload"])
      );
    }
  });
});
