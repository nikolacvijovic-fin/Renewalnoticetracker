import { describe, expect, it } from "vitest";
import { toCsv, toXlsxBuffer } from "@/lib/contracts/export";

describe("toCsv", () => {
  it("serializes contract rows with headers", () => {
    const csv = toCsv([
      {
        contract_title: "MSA",
        counterparty_name: "Acme",
        contract_type: "MSA",
        owner_name: "Jane Doe",
        department: "Finance",
        status_tag: "active",
        expiration_date: "2026-12-31",
        notice_deadline_date: "2026-12-01",
        auto_renewal: "Yes",
        payment_terms: "Net 30",
        needs_review: "No"
      }
    ]);

    expect(csv).toContain("contract_title,counterparty_name");
    expect(csv).toContain("MSA,Acme");
  });

  it("sanitizes spreadsheet formula prefixes instead of exporting live formulas", () => {
    const csv = toCsv([
      {
        contract_title: "=cmd|'/C calc'!A0",
        counterparty_name: "+Danger",
        contract_type: "@Injected",
        owner_name: "-Owner",
        department: "Finance",
        status_tag: "active",
        expiration_date: "2026-12-31",
        notice_deadline_date: "2026-12-01",
        auto_renewal: "Yes",
        payment_terms: "Net 30",
        needs_review: "No"
      }
    ]);

    expect(csv).toContain("'=cmd|'/C calc'!A0");
    expect(csv).toContain("'+Danger");
    expect(csv).toContain("'@Injected");
    expect(csv).toContain("'-Owner");
  });

  it("applies the same spreadsheet sanitization to xlsx exports", () => {
    const buffer = toXlsxBuffer([
      {
        contract_title: "=SUM(A1:A2)",
        counterparty_name: "Acme",
        contract_type: "MSA",
        owner_name: "Jane Doe",
        department: "Finance",
        status_tag: "active",
        expiration_date: "2026-12-31",
        notice_deadline_date: "2026-12-01",
        auto_renewal: "Yes",
        payment_terms: "Net 30",
        needs_review: "No"
      }
    ]);

    expect(buffer.length).toBeGreaterThan(0);
  });
});
