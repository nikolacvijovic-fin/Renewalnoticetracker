import { describe, expect, it } from "vitest";
import { normalizeAiProposedFact } from "@/lib/ai/ai-fact-normalizer";
import { aiFactCanBecomeTrusted } from "@/lib/ai/ai-trust-policy";

describe("unified AI fact trust policy", () => {
  it("keeps critical AI-derived renewal facts untrusted until reviewed with evidence", () => {
    const fact = normalizeAiProposedFact({
      field: "notice_deadline_date",
      value: "2026-08-15",
      source: "extraction",
      confidence: 0.96,
      evidenceReference: { sourceLabel: "Signed order form", excerptHash: "hash-1" }
    });

    expect(fact).toEqual(expect.objectContaining({
      trustStatus: "needs_review",
      requiresReview: true
    }));
    expect(aiFactCanBecomeTrusted(fact)).toBe(false);
  });

  it("allows reviewed evidence-backed AI facts to become trusted without raw provider payloads", () => {
    const fact = normalizeAiProposedFact({
      field: "auto_renewal",
      value: true,
      source: "ocr",
      confidence: 0.9,
      evidenceReference: { sourceLabel: "Contract metadata review", sourceId: "evidence-1" },
      reviewStatus: "reviewed"
    });

    expect(fact.trustStatus).toBe("accepted");
    expect(aiFactCanBecomeTrusted(fact)).toBe(true);
    expect(JSON.stringify(fact)).not.toMatch(/raw contract|ocr output|provider payload|token/i);
  });

  it("requires review when evidence is missing or confidence is weak", () => {
    const fact = normalizeAiProposedFact({
      field: "other",
      value: "possible renewal workflow",
      source: "extraction",
      confidence: 0.4,
      evidenceReference: null,
      reviewStatus: "reviewed"
    });

    expect(fact.trustStatus).toBe("needs_review");
    expect(aiFactCanBecomeTrusted(fact)).toBe(false);
  });
});
