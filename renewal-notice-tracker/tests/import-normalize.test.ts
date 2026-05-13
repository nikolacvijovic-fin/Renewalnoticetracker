import { describe, expect, it } from "vitest";
import { normalizeImportRows } from "@/lib/contracts/import";

describe("import normalization", () => {
  it("normalizes dates and trims values", () => {
    const rows = normalizeImportRows([
      {
        contract_title: "  MSA ",
        counterparty_name: " Acme ",
        expiration_date: "2026-12-31",
        notice_deadline_date: "invalid-date",
        recipient_emails: "test@example.com"
      }
    ]);

    expect(rows[0]).toEqual(
      expect.objectContaining({
        contract_title: "MSA",
        counterparty_name: "Acme",
        expiration_date: "2026-12-31",
        notice_deadline_date: null,
        recipient_emails: "test@example.com"
      })
    );
  });
});
