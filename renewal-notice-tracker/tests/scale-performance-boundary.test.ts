import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPORT_BACKGROUND_ARTIFACT_MAX_BYTES,
  EXPORT_BACKGROUND_ROW_LIMIT,
  EXPORT_DECISION_HISTORY_MAX_LENGTH,
  EXPORT_NOTE_PREVIEW_MAX_LENGTH,
  EXPORT_SYNC_ROW_LIMIT,
  EXPORT_XLSX_COMPLEXITY_SCORE_LIMIT,
  EXPORT_XLSX_TEXT_HEAVY_ROW_LIMIT
} from "@/lib/contracts/export";
import {
  OCR_DEFAULT_BATCH_LIMIT,
  OCR_MAX_BATCH_LIMIT
} from "@/lib/ocr/jobs";
import {
  REMINDER_DISPATCH_BATCH_LIMIT,
  REMINDER_PROCESSING_LEASE_MS
} from "@/lib/notifications/reminders";

const projectRoot = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("scale and performance boundaries", () => {
  it("keeps export size, row, and text bounds explicit", () => {
    expect(EXPORT_SYNC_ROW_LIMIT).toBe(5000);
    expect(EXPORT_BACKGROUND_ROW_LIMIT).toBe(25000);
    expect(EXPORT_BACKGROUND_ARTIFACT_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(EXPORT_NOTE_PREVIEW_MAX_LENGTH).toBe(160);
    expect(EXPORT_DECISION_HISTORY_MAX_LENGTH).toBe(500);
    expect(EXPORT_XLSX_COMPLEXITY_SCORE_LIMIT).toBe(1_000_000);
    expect(EXPORT_XLSX_TEXT_HEAVY_ROW_LIMIT).toBe(7500);
  });

  it("keeps organization member lookups scoped through memberships", () => {
    const kernelQueries = readProjectFile("lib/contracts/kernel-queries.ts");
    const legacyQueries = readProjectFile("lib/contracts/queries.ts");

    expect(kernelQueries).toContain("user:users(id, full_name, notification_email)");
    expect(kernelQueries).toContain('.from("memberships")');
    expect(kernelQueries).not.toContain('.from("users").select("id, full_name, notification_email")');

    expect(legacyQueries).toContain(
      "user:users(id, full_name, notification_email, monthly_digest_enabled)"
    );
    expect(legacyQueries).toContain('.from("memberships")');
    expect(legacyQueries).not.toContain(
      '.from("users").select("id, full_name, notification_email, monthly_digest_enabled")'
    );
  });

  it("keeps reminder and OCR workers bounded", () => {
    expect(REMINDER_PROCESSING_LEASE_MS).toBeGreaterThan(0);
    expect(REMINDER_DISPATCH_BATCH_LIMIT).toBeGreaterThan(0);
    expect(REMINDER_DISPATCH_BATCH_LIMIT).toBeLessThanOrEqual(100);
    expect(OCR_DEFAULT_BATCH_LIMIT).toBe(5);
    expect(OCR_MAX_BATCH_LIMIT).toBeLessThanOrEqual(25);

    const reminderSource = readProjectFile("lib/notifications/reminders.ts");
    const ocrSource = readProjectFile("lib/ocr/jobs.ts");

    expect(reminderSource).toContain(".limit(REMINDER_DISPATCH_BATCH_LIMIT)");
    expect(ocrSource).toContain("normalizeOcrBatchLimit");
    expect(ocrSource).toContain(".limit(batchLimit)");
  });

  it("ships concrete index coverage for high-scale query paths", () => {
    const migration = readProjectFile("supabase/migrations/202606030001_scale_readiness_indexes.sql");

    for (const expected of [
      "idx_contracts_org_updated",
      "idx_contracts_org_owner",
      "idx_contracts_org_department",
      "idx_reminders_org_status_remind_at",
      "idx_notes_contract_created",
      "idx_renewal_decisions_contract_decision_date",
      "idx_data_export_requests_scope_status_requested",
      "idx_ocr_jobs_status_queued",
      "idx_audit_logs_org_entity_created"
    ]) {
      expect(migration).toContain(expected);
    }
  });

  it("documents the supported envelope and future load-test plan", () => {
    const doc = readProjectFile("docs/SCALE_AND_PERFORMANCE.md");

    for (const required of [
      "500 contracts",
      "5,000 contracts",
      "ERR_EXPORT_BACKGROUND_ARTIFACT_TOO_LARGE_001",
      "ERR_EXPORT_XLSX_TOO_LARGE_001",
      "ERR_EXPORT_BACKGROUND_XLSX_TOO_LARGE_001",
      "k6 or Artillery",
      "background export request, processing, status, download, and cleanup",
      "reminder/OCR routes process only bounded batches"
    ]) {
      expect(doc).toContain(required);
    }
  });
});
