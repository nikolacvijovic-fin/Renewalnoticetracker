import { describe, expect, it } from "vitest";
import { buildEvidenceRows } from "@/lib/contracts/evidence";

describe("buildEvidenceRows", () => {
  it("normalizes evidence rows and skips blank snippets", () => {
    const rows = buildEvidenceRows(
      {
        contract_title: " Master Services Agreement ",
        expiration_date: " 2026-12-31 ",
        empty_field: "   "
      },
      {
        contract_title: 0.91,
        expiration_date: 0.77
      }
    );

    expect(rows).toEqual([
      {
        field_name: "contract_title",
        snippet: "Master Services Agreement",
        confidence: 0.91
      },
      {
        field_name: "expiration_date",
        snippet: "2026-12-31",
        confidence: 0.77
      }
    ]);
  });
});
