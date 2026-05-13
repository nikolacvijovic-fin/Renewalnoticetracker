import { describe, expect, it } from "vitest";
import { normalizeImportRows, parseImportFile, validateImportRows } from "@/lib/contracts/import";

describe("import parser dirty-data handling", () => {
  it("treats ambiguous slash-form dates as null instead of guessing", () => {
    const rows = normalizeImportRows([
      {
        contract_title: "Ambiguous Date Contract",
        expiration_date: "01/02/2025",
        notice_deadline_date: "02/03/2025"
      }
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        contract_title: "Ambiguous Date Contract",
        expiration_date: null,
        notice_deadline_date: null
      })
    ]);
  });

  it("parses quoted csv values with commas without corrupting columns", () => {
    const rows = parseImportFile(
      "contracts.csv",
      Buffer.from(
        [
          "contract_title,counterparty_name,recipient_emails",
          '"MSA Renewal","Acme, Inc.","owner@example.com,legal@example.com"'
        ].join("\n"),
        "utf8"
      )
    );

    expect(rows).toEqual([
      {
        contract_title: "MSA Renewal",
        counterparty_name: "Acme, Inc.",
        recipient_emails: "owner@example.com,legal@example.com"
      }
    ]);
  });

  it("reports row-level validation errors for invalid pilot-core dates", () => {
    const errors = validateImportRows([
      {
        contract_title: "Pilot Import",
        notice_deadline_date: "01/02/2025",
        auto_renewal_flag: "maybe"
      }
    ]);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "notice_deadline_date" }),
        expect.objectContaining({ field: "auto_renewal_flag" })
      ])
    );
  });
});
