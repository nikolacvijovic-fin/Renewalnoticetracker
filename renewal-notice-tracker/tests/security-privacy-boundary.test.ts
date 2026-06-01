import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("security and privacy boundaries", () => {
  it("documents sensitive data flows and default non-export/non-log rules", () => {
    const doc = readRepoFile("docs", "SECURITY_PRIVACY_DATA_FLOWS.md");

    for (const required of [
      "Uploaded contract files",
      "Extracted contract text and OCR text",
      "Contract notes",
      "Export Privacy Model",
      "OCR And AI Provider Flow",
      "Notes Privacy Model",
      "Internal And Destructive Routes",
      "Billing Privacy Model",
      "Never Export Or Log By Default"
    ]) {
      expect(doc).toContain(required);
    }

    expect(doc).toContain("Basic Contract Register");
    expect(doc).toContain("notes_and_decisions_export");
    expect(doc).toContain("timestamped HMAC signing");
  });

  it("keeps note audit evidence metadata-only rather than storing note previews", () => {
    const source = readRepoFile("lib", "actions", "contracts.ts");
    const noteActionStart = source.indexOf("export async function createNoteAction");
    const noteAction = source.slice(noteActionStart);

    expect(noteAction).toContain('action: "note.created"');
    expect(noteAction).toContain("note_length");
    expect(noteAction).toContain("body_redacted");
    expect(noteAction).not.toContain("body_preview");
    expect(noteAction).not.toContain("body.slice");
  });

  it("keeps basic exports away from sensitive notes, evidence, OCR, and audit fields", () => {
    const source = readRepoFile("lib", "contracts", "export.ts");
    const basicStart = source.indexOf("const BASIC_COLUMNS");
    const workflowStart = source.indexOf("const WORKFLOW_COLUMNS");
    const basicColumns = source.slice(basicStart, workflowStart);

    for (const forbidden of [
      "note",
      "evidence",
      "ocr",
      "extracted",
      "audit",
      "processing_error",
      "risk_band",
      "confidence_level"
    ]) {
      expect(basicColumns.toLowerCase()).not.toContain(forbidden);
    }
  });
});

