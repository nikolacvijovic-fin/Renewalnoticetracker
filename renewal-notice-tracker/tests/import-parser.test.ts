import { describe, expect, it } from "vitest";
import {
  assessImportRows,
  FixedImportTemplateError,
  parseImportFile,
  validateImportRows
} from "@/lib/contracts/import";

describe("import parser and assessment", () => {
  it("enforces the fixed NoticeControl template", () => {
    expect(() =>
      parseImportFile(
        "contracts.csv",
        Buffer.from("contract_title,counterparty_name,expiration_date\nMSA,Acme,2026-12-31", "utf8")
      )
    ).toThrow(FixedImportTemplateError);
  });

  it("parses quoted csv values with commas without corrupting columns", () => {
    const rows = parseImportFile(
      "contracts.csv",
      Buffer.from(
        [
          "contract_title,counterparty_name,notice_deadline_date,renewal_date,expiration_date,termination_window,owner_email,department,auto_renewal_flag,contract_value,source_file_name",
          '"MSA Renewal","Acme, Inc.",2026-12-01,2026-12-31,2026-12-31,"30 days",owner@example.com,Legal,true,125000,source.xlsx'
        ].join("\n"),
        "utf8"
      )
    );

    expect(rows).toEqual([
      expect.objectContaining({
        contract_title: "MSA Renewal",
        counterparty_name: "Acme, Inc.",
        owner_email: "owner@example.com"
      })
    ]);
  });

  it("treats ambiguous slash-form dates as validation failures instead of guessing", () => {
    const errors = validateImportRows([
      {
        contract_title: "Ambiguous Date Contract",
        counterparty_name: "Acme",
        expiration_date: "01/02/2025"
      }
    ]);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "expiration_date" })])
    );
  });

  it("classifies clean rows as imported", () => {
    const assessment = assessImportRows(
      [
        {
          contract_title: "MSA",
          counterparty_name: "Acme",
          notice_deadline_date: "2026-12-01",
          owner_email: "owner@example.com",
          department: "Legal",
          auto_renewal_flag: "true",
          contract_value: "1000",
          source_file_name: "acme.xlsx"
        }
      ],
      { knownOwnerEmails: new Set(["owner@example.com"]) }
    );

    expect(assessment.results[0]?.status).toBe("imported");
    expect(assessment.cleanupTriggers).toEqual([]);
  });

  it("classifies partial success rows with missing owners as needs cleanup", () => {
    const assessment = assessImportRows([
      {
        contract_title: "MSA",
        counterparty_name: "Acme",
        renewal_date: "2026-12-31"
      }
    ]);

    expect(assessment.results[0]).toEqual(
      expect.objectContaining({
        status: "needs_cleanup",
        warnings: expect.arrayContaining([
          "Owner email is missing, so the trusted workflow will stay blocked."
        ])
      })
    );
  });

  it("marks missing required fields and missing P0 as failed", () => {
    const assessment = assessImportRows([
      {
        contract_title: "",
        counterparty_name: "",
        source_file_name: "broken.xlsx"
      }
    ]);

    expect(assessment.results[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        errors: expect.arrayContaining([
          "Contract title is required.",
          "Counterparty name is required.",
          "At least one P0 date is required: notice_deadline_date, renewal_date, or expiration_date."
        ])
      })
    );
  });

  it("marks suspected duplicates separately from generic warnings", () => {
    const assessment = assessImportRows(
      [
        {
          contract_title: "MSA",
          counterparty_name: "Acme",
          notice_deadline_date: "2026-12-01",
          owner_email: "owner@example.com",
          department: "Legal",
          auto_renewal_flag: "true",
          contract_value: "1000",
          source_file_name: "one.xlsx"
        },
        {
          contract_title: "MSA",
          counterparty_name: "Acme",
          notice_deadline_date: "2026-12-01",
          owner_email: "owner@example.com",
          department: "Legal",
          auto_renewal_flag: "true",
          contract_value: "1000",
          source_file_name: "two.xlsx"
        }
      ],
      { knownOwnerEmails: new Set(["owner@example.com"]) }
    );

    expect(assessment.results.map((row) => row.status)).toEqual([
      "duplicate_suspected",
      "duplicate_suspected"
    ]);
    expect(assessment.cleanupTriggers).toContain(
      "More than 15% of rows look like duplicates and need cleanup."
    );
  });
});
