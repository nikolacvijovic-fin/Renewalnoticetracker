import { describe, expect, it } from "vitest";
import { normalizeImportRows } from "@/lib/contracts/import";

describe("import normalization", () => {
  it("normalizes dates, numbers, and trims recommended fields", () => {
    const rows = normalizeImportRows([
      {
        contract_title: "  MSA ",
        counterparty_name: " Acme ",
        expiration_date: "2026-12-31",
        notice_deadline_date: "invalid-date",
        owner_email: " OWNER@EXAMPLE.COM ",
        department: " Legal ",
        contract_value: " 12,500 ",
        source_file_name: " source.xlsx "
      }
    ]);

    expect(rows[0]).toEqual(
      expect.objectContaining({
        contract_title: "MSA",
        counterparty_name: "Acme",
        expiration_date: "2026-12-31",
        notice_deadline_date: null,
        owner_email: "owner@example.com",
        department: "Legal",
        contract_value: 12500,
        source_file_name: "source.xlsx"
      })
    );
  });
});
