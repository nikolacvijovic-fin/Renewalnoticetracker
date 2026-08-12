import { describe, expect, it } from "vitest";
import {
  assessSubscriptionUsageRows,
  buildSubscriptionUsageErrorCsv,
  buildSubscriptionUsageImportIdempotencyKey,
  parseSubscriptionUsageImportFile
} from "@/lib/subscription-usage/usage-import";

const header = "vendor,product,category,annual_cost,currency,purchased_seats,assigned_seats,active_users_30d,active_users_90d,last_activity_at,department,owner,contract_reference";

describe("subscription usage import", () => {
  it("parses valid CSV rows and computes safe summary", () => {
    const rows = parseSubscriptionUsageImportFile(
      "usage.csv",
      Buffer.from(`${header}\nAcme,Acme Suite,collaboration,12000,USD,100,80,20,35,2026-08-01,Finance,Ada,ACME-2026`)
    );
    const assessment = assessSubscriptionUsageRows(rows, {
      sourceLabel: "manual Okta CSV export",
      collectedAt: "2026-08-12T00:00:00.000Z"
    });

    expect(assessment.summary).toEqual(
      expect.objectContaining({
        totalRows: 1,
        readyCount: 1,
        estimatedAnnualCost: 12000,
        currency: "USD"
      })
    );
    expect(assessment.rows[0]?.normalized.sourceRowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects invalid amounts and currencies without raw file leakage", () => {
    const rows = parseSubscriptionUsageImportFile(
      "usage.csv",
      Buffer.from(`${header}\nAcme,Acme Suite,collaboration,not-money,usdollar,10,8,3,5,bad-date,Finance,Ada,ACME-2026`)
    );
    const assessment = assessSubscriptionUsageRows(rows, { sourceLabel: "manual export" });

    expect(assessment.rows[0]?.status).toBe("rejected");
    expect(assessment.rows[0]?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["invalid_annual_cost", "invalid_currency"])
    );
    expect(JSON.stringify(assessment)).not.toContain("raw contract text");
  });

  it("flags duplicate import rows and builds deterministic idempotency keys", () => {
    const rows = parseSubscriptionUsageImportFile(
      "usage.csv",
      Buffer.from(`${header}\nAcme,Suite,collaboration,1000,USD,10,8,3,5,2026-08-01,Ops,Ada,REF-1\nAcme,Suite,collaboration,1000,USD,10,8,3,5,2026-08-01,Ops,Ada,REF-1`)
    );
    const assessment = assessSubscriptionUsageRows(rows, { sourceLabel: "manual export" });
    const key = buildSubscriptionUsageImportIdempotencyKey({
      organizationId: "org-1",
      fileName: "usage.csv",
      rowHashes: assessment.rows.map((row) => row.normalized.sourceRowHash)
    });

    expect(assessment.summary.duplicateCount).toBe(2);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("excludes sample usage from real savings totals", () => {
    const rows = parseSubscriptionUsageImportFile(
      "usage.csv",
      Buffer.from(`${header}\nDemoCo,Demo Suite,collaboration,1000,USD,10,8,0,1,2026-08-01,Ops,Ada,SAMPLE-CONTRACT`)
    );
    const assessment = assessSubscriptionUsageRows(rows, { sourceLabel: "demo sample import" });

    expect(assessment.summary.sampleCount).toBe(1);
    expect(assessment.summary.readyCount).toBe(0);
    expect(assessment.summary.estimatedAnnualCost).toBe(0);
  });

  it("builds formula-safe downloadable error CSV", () => {
    const rows = parseSubscriptionUsageImportFile(
      "usage.csv",
      Buffer.from(`${header}\n=BAD(),Suite,collaboration,1000,USD,10,8,3,5,2026-08-01,Ops,Ada,REF-1`)
    );
    const assessment = assessSubscriptionUsageRows(rows, { sourceLabel: "manual export" });
    const csv = buildSubscriptionUsageErrorCsv(assessment.rows);

    expect(csv).toContain("row_number,status,issue_codes,message");
    expect(csv).not.toContain("=BAD()");
  });
});
