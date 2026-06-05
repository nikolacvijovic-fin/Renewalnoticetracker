import { describe, expect, it } from "vitest";
import {
  assertExportGenerationPreflight,
  buildExportRows,
  EXPORT_BACKGROUND_ROW_LIMIT,
  EXPORT_PRESETS,
  EXPORT_DECISION_HISTORY_MAX_LENGTH,
  EXPORT_NOTE_PREVIEW_MAX_LENGTH,
  EXPORT_XLSX_TEXT_HEAVY_ROW_LIMIT,
  ExportGenerationPreflightError,
  resolveExportPreset,
  toCsv,
  toXlsxBuffer
} from "@/lib/contracts/export";
import { makeContract } from "./factories/domain";
import {
  expectExportPresetColumns,
  expectSpreadsheetInjectionSanitized
} from "./helpers/domain-assertions";

const ownerLabelsByUserId = new Map([["owner-1", "Jane Doe"]]);

describe("export presets", () => {
  it("defaults to the backward-compatible basic contract register", () => {
    expect(resolveExportPreset(undefined).id).toBe("basic_contract_register");
    expectExportPresetColumns(EXPORT_PRESETS.basic_contract_register.columns, [
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
      contracts: [
        makeContract({
          extracted_text: "raw contract text should never export",
          processing_errors: [{ error_message: "hidden processing failure" }],
          audit_logs: [{ details: { provider_payload: "hidden provider payload" } }]
        })
      ] as never,
      ownerLabelsByUserId
    });

    expect(Object.keys(rows[0] ?? {})).not.toContain("latest_note_preview");
    expect(Object.keys(rows[0] ?? {})).not.toContain("risk_band");
    expect(Object.keys(rows[0] ?? {})).not.toContain("extracted_text");
    expect(Object.keys(rows[0] ?? {})).not.toContain("processing_errors");
    expect(Object.keys(rows[0] ?? {})).not.toContain("audit_logs");
    expect(JSON.stringify(rows[0] ?? {})).not.toContain("sensitive note text");
    expect(JSON.stringify(rows[0] ?? {})).not.toContain("raw contract text");
    expect(JSON.stringify(rows[0] ?? {})).not.toContain("hidden provider payload");
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

  it("bounds note previews and decision summaries for large rich exports", () => {
    const longNote = `=${"sensitive note ".repeat(40)}`;
    const manyDecisions = Array.from({ length: 60 }, (_, index) => ({
      id: `decision-${index}`,
      status: "defer",
      decision_date: `2026-06-${String((index % 28) + 1).padStart(2, "0")}`,
      summary: "Deferred",
      created_at: `2026-06-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`
    }));

    const rows = buildExportRows({
      preset: EXPORT_PRESETS.notes_and_decisions_export,
      contracts: [
        makeContract({
          notes: [
            {
              id: "note-long",
              body: longNote,
              author_user_id: "owner-1",
              created_at: "2026-06-03T00:00:00.000Z"
            }
          ],
          renewal_decisions: manyDecisions
        })
      ] as never,
      ownerLabelsByUserId
    });

    expect(String(rows[0]?.latest_note_preview).length).toBeLessThanOrEqual(
      EXPORT_NOTE_PREVIEW_MAX_LENGTH
    );
    expect(String(rows[0]?.decision_history_summary).length).toBeLessThanOrEqual(
      EXPORT_DECISION_HISTORY_MAX_LENGTH
    );
  });

  it("rejects oversized text-heavy XLSX before workbook generation while allowing CSV", () => {
    const rows = Array.from(
      { length: EXPORT_XLSX_TEXT_HEAVY_ROW_LIMIT + 1 },
      (_, index) => ({
        contract_title: `MSA ${index}`,
        latest_note_preview: "bounded note preview",
        decision_history_summary: "bounded decision summary"
      })
    );

    expect(() =>
      assertExportGenerationPreflight({
        preset: EXPORT_PRESETS.notes_and_decisions_export,
        format: "xlsx",
        rows
      })
    ).toThrow(ExportGenerationPreflightError);

    expect(() =>
      assertExportGenerationPreflight({
        preset: EXPORT_PRESETS.notes_and_decisions_export,
        format: "csv",
        rows
      })
    ).not.toThrow();
  });

  it("keeps basic XLSX within the background row envelope", () => {
    const rows = Array.from({ length: EXPORT_BACKGROUND_ROW_LIMIT }, (_, index) => ({
      contract_title: `MSA ${index}`
    }));

    expect(() =>
      assertExportGenerationPreflight({
        preset: EXPORT_PRESETS.basic_contract_register,
        format: "xlsx",
        rows
      })
    ).not.toThrow();
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
    expectSpreadsheetInjectionSanitized("=cmd|'/C calc'!A0");
    expectSpreadsheetInjectionSanitized("+Danger");
    expectSpreadsheetInjectionSanitized("@Injected");
    expectSpreadsheetInjectionSanitized("-Owner");
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
