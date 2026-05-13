import { describe, expect, it } from "vitest";

describe("import template route", () => {
  it("returns a downloadable csv template", async () => {
    const { GET } = await import("@/app/dashboard/contracts/import-template/route");
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("renewal-import-template.csv");
    expect(body).toContain(
      "contract_title,counterparty_name,notice_deadline_date,renewal_date,expiration_date,termination_window,auto_renewal_flag,owner_email,recipient_emails"
    );
  });
});
