import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ONBOARDING_MILESTONE_IDS,
  CUSTOMER_ONBOARDING_MILESTONES
} from "@/lib/product/customer-onboarding";
import {
  CUSTOMER_HEALTH_SIGNAL_IDS,
  CUSTOMER_HEALTH_SIGNALS,
  SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA
} from "@/lib/product/support-success";
import {
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_TAXONOMY,
  PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS
} from "@/lib/product/event-taxonomy";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

function allMilestoneEvents(milestoneId: (typeof CUSTOMER_ONBOARDING_MILESTONE_IDS)[number]) {
  const evidence = CUSTOMER_ONBOARDING_MILESTONES[milestoneId].evidence;
  return [...evidence.shippedEvidenceEvents, ...evidence.futureEvidenceEvents];
}

function sourcePathsFrom(source: string) {
  return [...source.matchAll(/\b(?:app|lib|components|tests|scripts)\/[^\s,;]+?\.(?:ts|tsx|js|mjs)\b/g)].map(
    (match) => match[0]
  );
}

function readSourceFile(repoRelativePath: string) {
  return readRepoFile(...repoRelativePath.split("/"));
}

function extractDocSection(content: string, heading: string) {
  const start = content.indexOf(`## ${heading}`);
  if (start === -1) return "";
  const next = content.indexOf("\n## ", start + 1);
  return content.slice(start, next === -1 ? content.length : next);
}

describe("event taxonomy, onboarding, and support-success evidence alignment", () => {
  it("defines a unique safe event taxonomy for shipped and future evidence", () => {
    const eventNamesFromEntries = PRODUCT_EVENT_NAMES.map((eventName) => {
      const event = PRODUCT_EVENT_TAXONOMY[eventName];
      expect(event.name, eventName).toBe(eventName);
      expect(["audit", "analytics", "monitoring", "operational", "billing", "support"]).toContain(
        event.type
      );
      expect(["low", "medium", "high", "restricted"]).toContain(event.privacySensitivity);
      expect(event.source.trim().length, `${eventName} needs source`).toBeGreaterThan(0);
      expect(PLATFORM_MODULES, `${eventName} needs owning module`).toHaveProperty(
        event.owningProductModule
      );
      expect(event.safeMetadataFields.length, `${eventName} needs safe metadata`).toBeGreaterThan(0);
      expect(event.forbiddenMetadataFields).toEqual(PRODUCT_EVENT_FORBIDDEN_METADATA_FIELDS);

      for (const forbiddenField of SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA) {
        expect(event.safeMetadataFields, `${eventName} must not allow ${forbiddenField}`).not.toContain(
          forbiddenField
        );
      }

      return event.name;
    });

    expect(new Set(eventNamesFromEntries).size).toBe(eventNamesFromEntries.length);
  });

  it("backs every emitted-today event with a real source file containing that event name", () => {
    for (const eventName of PRODUCT_EVENT_NAMES) {
      const event = PRODUCT_EVENT_TAXONOMY[eventName];
      const sourcePaths = sourcePathsFrom(event.source);

      if (!event.emittedToday) {
        expect(
          event.source.toLowerCase(),
          `${eventName} future/deferred event needs an explicit non-runtime source description`
        ).toMatch(/future|deferred|reserved/);
        continue;
      }

      expect(sourcePaths.length, `${eventName} needs at least one concrete source file`).toBeGreaterThan(0);

      let foundInReferencedSource = false;
      for (const sourcePath of sourcePaths) {
        const absolutePath = path.join(repoRoot, ...sourcePath.split("/"));
        expect(fs.existsSync(absolutePath), `${eventName} source file should exist: ${sourcePath}`).toBe(
          true
        );

        const sourceContent = readSourceFile(sourcePath);
        if (sourceContent.includes(eventName)) {
          foundInReferencedSource = true;
        }
      }

      expect(
        foundInReferencedSource,
        `${eventName} is marked emittedToday but does not appear in its referenced runtime source`
      ).toBe(true);
    }
  });

  it("requires shipped onboarding milestones to reference real emitted events or real state/query fallbacks", () => {
    for (const milestoneId of CUSTOMER_ONBOARDING_MILESTONE_IDS) {
      const milestone = CUSTOMER_ONBOARDING_MILESTONES[milestoneId];
      const { shippedEvidenceEvents, futureEvidenceEvents, stateOrQueryFallbacks } = milestone.evidence;

      expect(
        [...shippedEvidenceEvents, ...stateOrQueryFallbacks].length,
        `${milestoneId} needs shipped event evidence or query fallback`
      ).toBeGreaterThan(0);

      for (const eventName of shippedEvidenceEvents) {
        const event = PRODUCT_EVENT_TAXONOMY[eventName as keyof typeof PRODUCT_EVENT_TAXONOMY];
        expect(event, `${milestoneId} references unknown shipped event ${eventName}`).toBeDefined();
        expect(event.emittedToday, `${milestoneId}:${eventName} must be emitted today`).toBe(true);
      }

      for (const eventName of futureEvidenceEvents) {
        const event = PRODUCT_EVENT_TAXONOMY[eventName as keyof typeof PRODUCT_EVENT_TAXONOMY];
        expect(event, `${milestoneId} references unknown future event ${eventName}`).toBeDefined();
        expect(event.emittedToday, `${milestoneId}:${eventName} must be marked future`).toBe(false);
      }
    }
  });

  it("keeps every onboarding and support referenced event inside the taxonomy", () => {
    for (const milestoneId of CUSTOMER_ONBOARDING_MILESTONE_IDS) {
      for (const eventName of allMilestoneEvents(milestoneId)) {
        expect(PRODUCT_EVENT_TAXONOMY, `${milestoneId}:${eventName}`).toHaveProperty(eventName);
      }
    }

    for (const signalId of CUSTOMER_HEALTH_SIGNAL_IDS) {
      const signal = CUSTOMER_HEALTH_SIGNALS[signalId];
      for (const eventName of [...signal.eventEvidence, ...signal.futureEventEvidence]) {
        expect(PRODUCT_EVENT_TAXONOMY, `${signalId}:${eventName}`).toHaveProperty(eventName);
      }
    }
  });

  it("declares whether every support health signal is computable today or future-only", () => {
    for (const signalId of CUSTOMER_HEALTH_SIGNAL_IDS) {
      const signal = CUSTOMER_HEALTH_SIGNALS[signalId];

      if (signal.computability === "computable_today") {
        expect(
          [...signal.eventEvidence, ...signal.stateOrQuerySources].length,
          `${signalId} computable today needs real evidence or query source`
        ).toBeGreaterThan(0);

        for (const eventName of signal.eventEvidence) {
          const event = PRODUCT_EVENT_TAXONOMY[eventName as keyof typeof PRODUCT_EVENT_TAXONOMY];
          expect(event, `${signalId} references unknown event ${eventName}`).toBeDefined();
          expect(event.emittedToday, `${signalId}:${eventName} must be emitted today`).toBe(true);
        }
      } else {
        expect(signal.eventEvidence, `${signalId} future-only signal should not claim shipped events`).toEqual([]);
        expect(signal.futureEventEvidence.length, `${signalId} needs future evidence`).toBeGreaterThan(0);
        for (const eventName of signal.futureEventEvidence) {
          const event = PRODUCT_EVENT_TAXONOMY[eventName as keyof typeof PRODUCT_EVENT_TAXONOMY];
          expect(event, `${signalId} references unknown future event ${eventName}`).toBeDefined();
          expect(event.emittedToday, `${signalId}:${eventName} must be future`).toBe(false);
        }
      }

      for (const forbiddenField of SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA) {
        expect(signal.safeMetadata, `${signalId} should not allow ${forbiddenField}`).not.toContain(
          forbiddenField
        );
      }
    }
  });

  it("keeps event taxonomy docs and boundary docs aligned without implying live health dashboards", () => {
    const eventTaxonomyDoc = readRepoFile("docs", "EVENT_TAXONOMY.md");
    const onboardingDoc = readRepoFile("docs", "CUSTOMER_ONBOARDING_BOUNDARY.md");
    const supportDoc = readRepoFile("docs", "SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md");
    const implementationDoc = readRepoFile(
      "docs",
      "enterprise",
      "SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md"
    );

    for (const eventName of PRODUCT_EVENT_NAMES) {
      expect(eventTaxonomyDoc, eventName).toContain(`\`${eventName}\``);
    }

    const shippedSection = extractDocSection(eventTaxonomyDoc, "Current Shipped Event Evidence");
    const futureSection = extractDocSection(eventTaxonomyDoc, "Future Or Deferred Event Evidence");
    for (const eventName of PRODUCT_EVENT_NAMES) {
      const event = PRODUCT_EVENT_TAXONOMY[eventName];
      if (event.emittedToday) {
        expect(shippedSection, `${eventName} should be documented as shipped`).toContain(
          `\`${eventName}\``
        );
        expect(futureSection, `${eventName} should not be documented as future`).not.toContain(
          `\`${eventName}\``
        );
      } else {
        expect(futureSection, `${eventName} should be documented as future/deferred`).toContain(
          `\`${eventName}\``
        );
        expect(shippedSection, `${eventName} should not be documented as shipped`).not.toContain(
          `\`${eventName}\``
        );
      }
    }

    for (const milestoneId of CUSTOMER_ONBOARDING_MILESTONE_IDS) {
      expect(onboardingDoc, milestoneId).toContain(`\`${milestoneId}\``);
    }

    for (const signalId of CUSTOMER_HEALTH_SIGNAL_IDS) {
      expect(supportDoc, signalId).toContain(`\`${signalId}\``);
    }

    expect(onboardingDoc).toContain("shipped event evidence");
    expect(onboardingDoc).toContain("state/query fallback evidence");
    expect(supportDoc).toContain("computable today");
    expect(supportDoc).toMatch(/future-only/i);
    expect(implementationDoc).toContain("lib/product/event-taxonomy.ts");
    expect(implementationDoc).toContain("EVENT_TAXONOMY.md");

    const combinedDocs = [eventTaxonomyDoc, onboardingDoc, supportDoc, implementationDoc].join("\n");
    expect(combinedDocs).not.toMatch(/live customer success dashboard/i);
    expect(combinedDocs).not.toMatch(/ships customer-facing health score/i);
    expect(combinedDocs).not.toMatch(/enables customer-facing health score/i);
  });
});
