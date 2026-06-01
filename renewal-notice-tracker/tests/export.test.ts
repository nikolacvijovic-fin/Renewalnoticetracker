import { describe, expect, it } from "vitest";
import {
  buildExportRows,
  EXPORT_PRESETS,
  resolveExportPreset,
  sanitizeSpreadsheetValue,
  toCsv,
  toXlsxBuffer
} from "@/lib/contracts/export";

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    status: "active",
    cycle_status: "awaiting_decision",
    status_tag: "active",
    owner_user_id: "owner-1",
    owner_name: "Jane Doe",
    department: "Finance",
    renewal_decision_status: "undecided",
    created_at: "2026-05-01T00:00:00.000Z",
    counterparty_id: "counterparty-1",
    contract_metadata: {
      contract_title: "MSA",
      counterparty_name: "Acme",
      contract_type: "MSA",
      renewal_date: "2026-11-30",
      expiration_date: "2026-12-31",
      notice_deadline_date: "2026-12-01",
      auto_renewal: true,
      payment_terms: "Net 30",
      needs_review: false,
      contract_value_amount: 100000,
      contract_value_currency: "USD",
      financial_data_trust_status: "high",
      price_change_trigger: "Annual increase"
    },
    reminders: [
      {
        remind_at: "2099-01-01T00:00:00.000Z",
        status: "scheduled",
        created_at: "2026-05-02T00:00:00.000Z"
      }
    ],
    renewal_decisions: [
      {
        status: "renew",
        decision_date: "2026-06-01",
        summary: "Renewed",
        created_at: "2026-06-01T00:00:00.000Z"
      }
    ],
    notes: [
      {
        body: "=sensitive note text that should not appear in basic export",
        author_user_id: "owner-1",
        created_at: "2026-06-02T00:00:00.000Z"
      }
    ],
    ...overrides
  };
}

const ownerLabelsByUserId = new Map([["owner-1", "Jane Doe"]]);

describe("export presets", () => {
  it("defaults to the backward-compatible basic contract register", () => {
    expect(resolveExportPreset(undefined).id).toBe("basic_contract_register");
    expect(EXPORT_PRESETS.basic_contract_register.columns.map((column) => column.key)).toEqual([
      "contract_title",
      "counterparty_name",
      "contract_type",
      "owner_name",
      "department",
      "status_tag",
      "renewal_date",
      "expiration_date",
      "notice_deadline_date",
      "auto_renewal",
      "payment_terms",
      "needs_review"
    ]);
  });

  it("keeps notes and intelligence out of the default basic export", () => {
    const rows = buildExportRows({
      preset: EXPORT_PRESETS.basic_contract_register,
      contracts: [makeContract()] as never,
      ownerLabelsByUserId
    });

    expect(Object.keys(rows[0] ?? {})).not.toContain("latest_note_preview");
    expect(Object.keys(rows[0] ?? {})).not.toContain("risk_band");
    expect(JSON.stringify(rows[0] ?? {})).not.toContain("sensitive note text");
  });

  it("includes workflow fields only in the workflow export", () => {
    const rows = buildExportRows({
      preset: EXPORT_PRESETS.workflow_export,
      contracts: [makeContract()] as never,
      ownerLabelsByUserId
    });

    expect(rows[0]).toMatchObject({
      cycle_status: "awaiting_decision",
      renewal_decision_status: "undecided",
      latest_reminder_status: "scheduled",
      latest_renewal_decision: "renew",
      latest_decision_date: "2026-06-01"
    });
    expect(Object.keys(rows[0] ?? {})).not.toContain("latest_note_preview");
  });

  it("includes sanitized notes only in notes and decisions export", () => {
    const rows = buildExportRows({
      preset: EXPORT_PRESETS.notes_and_decisions_export,
      contracts: [makeContract()] as never,
      ownerLabelsByUserId
    });
    const csv = toCsv(rows, EXPORT_PRESETS.notes_and_decisions_export.columns);

    expect(rows[0]).toMatchObject({
      note_count: 1,
      latest_note_author: "Jane Doe",
      decision_history_summary: "renew on 2026-06-01"
    });
    expect(csv).toContain("'=sensitive note text");
  });

  it("includes risk and financial fields only in intelligence export", () => {
    const rows = buildExportRows({
      preset: EXPORT_PRESETS.intelligence_export,
      contracts: [makeContract()] as never,
      ownerLabelsByUserId
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        risk_band: expect.any(String),
        score_points: expect.any(Number),
        confidence_level: expect.any(String),
        missing_data_warnings_count: expect.any(Number),
        contract_value_amount: 100000,
        contract_value_currency: "USD",
        financial_data_trust_status: "high"
      })
    );
    expect(Object.keys(rows[0] ?? {})).not.toContain("latest_note_preview");
  });
});

describe("export serialization", () => {
  it("serializes contract rows with headers", () => {
    const csv = toCsv([
      {
        contract_title: "MSA",
        counterparty_name: "Acme",
        contract_type: "MSA",
        owner_name: "Jane Doe",
        department: "Finance",
        status_tag: "active",
        renewal_date: "2026-11-30",
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

  it("sanitizes spreadsheet formula prefixes for every string field", () => {
    expect(sanitizeSpreadsheetValue("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
    expect(sanitizeSpreadsheetValue("+Danger")).toBe("'+Danger");
    expect(sanitizeSpreadsheetValue("@Injected")).toBe("'@Injected");
    expect(sanitizeSpreadsheetValue("-Owner")).toBe("'-Owner");
  });

  it("applies the same spreadsheet sanitization to xlsx exports", () => {
    const buffer = toXlsxBuffer([
      {
        contract_title: "=SUM(A1:A2)",
        counterparty_name: "Acme"
      }
    ]);

    expect(buffer.length).toBeGreaterThan(0);
  });
});
