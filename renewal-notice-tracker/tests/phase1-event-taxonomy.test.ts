import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PHASE1_ANALYTICS_EVENT_NAMES
} from "@/lib/analytics/phase1-events";
import {
  FUTURE_ANALYTICS_EVENT_NAMES
} from "@/lib/analytics/future-events";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const shippedRuntimeRoots = [
  path.join(repoRoot, "app"),
  path.join(repoRoot, "components"),
  path.join(repoRoot, "lib", "actions"),
  path.join(repoRoot, "lib", "analytics"),
  path.join(repoRoot, "lib", "billing"),
  path.join(repoRoot, "lib", "contracts"),
  path.join(repoRoot, "lib", "notifications")
];

function walkFiles(directory: string, collected: string[] = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, collected);
      continue;
    }

    if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      collected.push(fullPath);
    }
  }

  return collected;
}

function extractTrackedAnalyticsEventNames(content: string) {
  return [...content.matchAll(/trackServerAnalyticsEvent\(\s*\{[\s\S]*?eventName:\s*"([^"]+)"/g)]
    .map((match) => match[1]);
}

describe("phase-1 analytics taxonomy", () => {
  it("keeps the phase-1 runtime taxonomy small and future taxonomy detached", () => {
    expect(PHASE1_ANALYTICS_EVENT_NAMES).toEqual([
      "auth_signup_completed",
      "contract_upload_completed",
      "import_started",
      "import_completed",
      "import_failed",
      "extraction_completed",
      "extraction_failed",
      "contract_review_completed",
      "contract_owner_assigned",
      "reminder_scheduled",
      "reminder_sent",
      "reminder_failed",
      "acknowledgment_recorded",
      "renewal_decision_recorded",
      "export_requested",
      "billing_checkout_started",
      "checkout_completed",
      "internal_rescue_action_recorded"
    ]);
    expect(FUTURE_ANALYTICS_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        "digest_sent",
        "escalation_rule_created",
        "playbook_applied",
        "health_score_snapshot",
        "profitability_snapshot"
      ])
    );
  });

  it("allows shipped runtime to emit only phase-1 events and forbids future taxonomy imports", () => {
    const allowedEvents = new Set(PHASE1_ANALYTICS_EVENT_NAMES);
    const files = shippedRuntimeRoots.flatMap((directory) => walkFiles(directory));

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      expect(content, `${filePath} should not import future analytics taxonomy`).not.toContain(
        "@/lib/analytics/future-events"
      );

      for (const eventName of extractTrackedAnalyticsEventNames(content)) {
        expect(
          allowedEvents.has(eventName as (typeof PHASE1_ANALYTICS_EVENT_NAMES)[number]),
          `${path.relative(repoRoot, filePath)} emits non-phase1 analytics event ${eventName}`
        ).toBe(true);
      }
    }
  });

  it("keeps taxonomy docs aligned with code", () => {
    const phase1Doc = fs.readFileSync(path.join(repoRoot, "docs", "PHASE1_EVENT_TAXONOMY.md"), "utf8");
    const futureDoc = fs.readFileSync(path.join(repoRoot, "docs", "FUTURE_EVENT_TAXONOMY.md"), "utf8");

    for (const eventName of PHASE1_ANALYTICS_EVENT_NAMES) {
      expect(phase1Doc).toContain(`\`${eventName}\``);
    }

    for (const eventName of [
      "digest_sent",
      "escalation_rule_created",
      "playbook_applied",
      "health_score_snapshot",
      "profitability_snapshot"
    ]) {
      expect(futureDoc).toContain(`\`${eventName}\``);
    }
  });
});
