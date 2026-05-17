import { describe, expect, it } from "vitest";

import {
  buildCounterpartyIdentity,
  resolveCounterpartyAlias,
  suggestDuplicateCounterparties
} from "@/lib/contracts/counterparty-normalization";

describe("counterparty normalization", () => {
  it("preserves the raw name while creating a normalized vendor identity", () => {
    const identity = buildCounterpartyIdentity("  Acme, Inc.  ");

    expect(identity).toEqual({
      rawCounterpartyName: "Acme, Inc.",
      normalizedCounterpartyName: "acme"
    });
  });

  it("suggests duplicates for closely matching vendor identities", () => {
    const suggestions = suggestDuplicateCounterparties(
      [
        {
          id: "cp-1",
          raw_counterparty_name: "Acme LLC",
          normalized_counterparty_name: "acme",
          merged_into_counterparty_id: null,
          contract_count: 4
        },
        {
          id: "cp-2",
          raw_counterparty_name: "Beta Systems",
          normalized_counterparty_name: "beta systems",
          merged_into_counterparty_id: null,
          contract_count: 2
        }
      ],
      "Acme Incorporated"
    );

    expect(suggestions).toEqual([
      expect.objectContaining({
        id: "cp-1",
        rawCounterpartyName: "Acme LLC",
        normalizedCounterpartyName: "acme",
        score: 85
      })
    ]);
  });

  it("resolves aliases back to the canonical vendor identity", () => {
    const resolved = resolveCounterpartyAlias(
      [
        {
          id: "cp-source",
          raw_counterparty_name: "ACME Europe d.o.o.",
          normalized_counterparty_name: "acme europe",
          merged_into_counterparty_id: "cp-target"
        },
        {
          id: "cp-target",
          raw_counterparty_name: "Acme Europe",
          normalized_counterparty_name: "acme europe",
          merged_into_counterparty_id: null
        }
      ],
      [
        {
          counterparty_id: "cp-source",
          alias_name: "ACME EU",
          normalized_alias_name: "acme eu"
        }
      ],
      "ACME EU"
    );

    expect(resolved).toBe("cp-target");
  });
});
