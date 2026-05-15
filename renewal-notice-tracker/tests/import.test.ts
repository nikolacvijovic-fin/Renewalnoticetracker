import { describe, expect, it } from "vitest";
import { parseImportFile } from "@/lib/contracts/import";

describe("parseImportFile", () => {
  it("parses csv rows", () => {
    const buffer = Buffer.from(
      [
        "contract_title,counterparty_name,notice_deadline_date,renewal_date,expiration_date,termination_window,owner_email,department,auto_renewal_flag,contract_value,source_file_name",
        "MSA,Acme,2026-12-01,2026-12-31,2026-12-31,30 days,owner@example.com,Legal,true,1000,acme.xlsx"
      ].join("\n"),
      "utf8"
    );
    const rows = parseImportFile("contracts.csv", buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.contract_title).toBe("MSA");
    expect(rows[0]?.counterparty_name).toBe("Acme");
    expect(rows[0]?.owner_email).toBe("owner@example.com");
  });
});
