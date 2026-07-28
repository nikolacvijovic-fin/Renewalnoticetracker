import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_EVENT_TAXONOMY } from "@/lib/product/event-taxonomy";

const docs = readFileSync(join(process.cwd(), "docs/EVENT_TAXONOMY.md"), "utf8");

const quoteEvents = [
  "renewal_quote_comparison.created",
  "renewal_quote_comparison.completed",
  "renewal_quote_comparison.failed",
  "renewal_quote_finding.reviewed",
  "savings_opportunity.created",
  "savings_opportunity.dismissed",
  "savings_opportunity.realized"
] as const;

describe("quote comparison event taxonomy", () => {
  it("documents all emitted quote comparison audit events", () => {
    for (const eventName of quoteEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry).toBeDefined();
      expect(entry.emittedToday).toBe(true);
      expect(entry.source).toBe("lib/quote-comparison/quote-comparison.ts");
      expect(docs).toContain(`\`${eventName}\``);
    }
  });

  it("does not allow raw quote or provider payload metadata", () => {
    for (const eventName of quoteEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry.safeMetadataFields.join("|")).not.toMatch(/raw|payload|secret|token|storage|ocr/i);
      expect(entry.forbiddenMetadataFields).toContain("provider_payload");
      expect(entry.forbiddenMetadataFields).toContain("raw_contract_text");
    }
  });
});
