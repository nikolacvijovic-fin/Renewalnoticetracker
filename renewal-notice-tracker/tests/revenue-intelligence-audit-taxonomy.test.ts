import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS,
  PRODUCT_EVENT_TAXONOMY
} from "@/lib/product/event-taxonomy";

const emittedRevenueEvents = [
  "revenue_intelligence.snapshot_generated",
  "revenue_intelligence.signals_refreshed",
  "revenue_intelligence.metrics_refreshed",
  "revenue_intelligence.vendor_category_refreshed",
  "revenue_intelligence.forecast_refreshed",
  "revenue_intelligence.insights_refreshed",
  "revenue_intelligence.insight_reviewed",
  "revenue_intelligence.signal_archived",
  "revenue_intelligence.refresh_job_enqueued"
] as const;

const futureRevenueEvents = [
  "revenue_intelligence.refresh_job_completed",
  "revenue_intelligence.refresh_job_failed"
] as const;

describe("revenue intelligence audit taxonomy", () => {
  it("registers emitted command-center audit events against the runtime service", () => {
    for (const eventName of emittedRevenueEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry, eventName).toBeDefined();
      expect(entry.type).toBe("audit");
      expect(entry.emittedToday).toBe(true);
      expect(entry.source).toBe("lib/revenue-intelligence/revenue-intelligence.ts");
      expect(entry.owningProductModule).toBe("revenue_intelligence_command_center");
      expect(entry.safeMetadataFields).toEqual(expect.arrayContaining([
        "organization_id",
        "actor_user_id",
        "snapshotId",
        "signalCount",
        "metricCount",
        "sourceModule"
      ]));
      expect(entry.safeMetadataFields).not.toEqual(expect.arrayContaining([
        "raw_contract_text",
        "full_notes",
        "ocr_output",
        "provider_payload",
        "storage_path"
      ]));
      expect(entry.forbiddenMetadataFields).toEqual(PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS);
    }
  });

  it("keeps background completion and failure as future contracts until a worker emits them", () => {
    for (const eventName of futureRevenueEvents) {
      const entry = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(entry, eventName).toBeDefined();
      expect(entry.emittedToday).toBe(false);
      expect(entry.source).toMatch(/future revenue intelligence background worker/i);
    }
  });

  it("documents every revenue intelligence event in taxonomy and module docs", () => {
    const taxonomyDocs = fs.readFileSync(path.join(process.cwd(), "docs/EVENT_TAXONOMY.md"), "utf8");
    const moduleDocs = fs.readFileSync(path.join(process.cwd(), "docs/REVENUE_INTELLIGENCE_COMMAND_CENTER.md"), "utf8");

    for (const eventName of [...emittedRevenueEvents, ...futureRevenueEvents]) {
      expect(taxonomyDocs, eventName).toContain(eventName);
      expect(moduleDocs, eventName).toContain(eventName);
    }
    expect(moduleDocs).toContain("does not deliver messages or run campaigns");
  });
});
