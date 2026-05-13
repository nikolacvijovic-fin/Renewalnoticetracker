import { describe, expect, it } from "vitest";
import { parseImportFile } from "@/lib/contracts/import";

describe("parseImportFile", () => {
  it("parses csv rows", () => {
    const buffer = Buffer.from(
      "contract_title,counterparty_name,expiration_date\nMSA,Acme,2026-12-31",
      "utf8"
    );
    const rows = parseImportFile("contracts.csv", buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.contract_title).toBe("MSA");
    expect(rows[0]?.counterparty_name).toBe("Acme");
  });
});
