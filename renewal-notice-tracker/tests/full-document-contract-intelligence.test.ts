// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  applySelectiveOcrFallback,
  buildDocumentChunks,
  ContractDocumentParseError,
  parseContractDocument,
  type ParsedContractDocument
} from "@/lib/contract-intelligence/document-parser";
import { extractFullCommercialDocument } from "@/lib/contract-intelligence/full-document-extractor";
import { buildCommercialAnalysis } from "@/lib/contract-intelligence/commercial-analysis";
import type { CommercialExtractionProvider } from "@/lib/contract-intelligence/openai-commercial-extractor";
import type { ContractExtractedField } from "@/lib/contract-intelligence/extraction-types";
import type { ContractDocumentRelationship } from "@/lib/contract-intelligence/extraction-types";
import type { OcrProvider } from "@/lib/ocr/types";

const THREE_PAGE_PDF = "JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxNDcKPj4Kc3RyZWFtCnicJYq9CgJBDIT7PMXWgpifye4tiIXciYWNsC8gcoqHFor4/OY0wySTj3nSthGnWa8rrfbj/TO+b+fTsnDt0HHpahJJ7UKK1A4kv6okcCrh9qA1eoibA+6qHMmhbjBXVOfgFTsMyhCUYB7qw0PUOHuex7MV5FoiBUOW+CKZGpsZax9X/nuT2kRtQUOjI30BkHkofgplbmRzdHJlYW0KZW5kb2JqCgo4IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9MZW5ndGggMTQ1Cj4+CnN0cmVhbQp4nDWKwQoCMQxE7/mKnAWxTZrJFsSDu108eBH6AyIqih4U8fvtLkiYzMB7L9pWCjzd+0qr3fnxPX9up+MyexJ0Yug4Rq4XksR1T3FWI6fA3lKftLaEDibB1Q3iCnVB9uAJGSNKIwJDgbm7SkB0a2zE0NbkKCJ69J4bm30VDaoaZWj9/2XD9U51QaXSgX67jyfDCmVuZHN0cmVhbQplbmRvYmoKCjEwIDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9MZW5ndGggMTQ0Cj4+CnN0cmVhbQp4nCWMvQoCQQyE+zxFakHMzyZ7B2KhLFjYCHkBkVOUs1DE5zerDCHD5Ms8YRtA2PW6wmo/zZ/pfTuflkJEA9k4ODJjXEAKxgH4hzIWwpoTD1gX9uatmrPvhNzd3Kqm4ypuQmampQgpqyj91a/5lamPubWTyWvnXeqYdLpK2SSeafYXaRuMO8QCWsARvt7lJ5oKZW5kc3RyZWFtCmVuZG9iagoKMTEgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL09ialN0bQovTiA3Ci9GaXJzdCAzOAovTGVuZ3RoIDQwNgo+PgpzdHJlYW0KeJzVVE1r3DAQvetXzLE5FI1lWR9hWdjs2i2U0JAUElpycGyxuASp2NqS/vvO2JuEHEoPbQ7BjKSZeTN6Yz9cAIKCykAJHkFDpcnAKAMWHFbgwTsNq5WQX379CCAv2n2YhPw09BN8IyTCJSF59fN6K+Q2HWKGUqzX4rlu2+b2Pu3F0gAKBj8iLsbUH7owwqqpmwbRIqLRZAZR7WjfknkyRT7llKMzmdVHo5gtEcsN5ZrFjF1qOD9jq2N9TTthDWN2C1a7xX+6l++qlx7qb3z8Wsjz1O/aHODd7lShMuiUKXTpdfH1hF7HGNqc3u5wM/8hxT9O+OI7NylmIa8Od3l2OVgIedZOgTMgP4b7nyEPXStkHbvUD3EP8nqImzgNj4GXHVkwLJsxUP2iG3kZpnQYOxIS4+bOfHhq/t4iydahdZ40fZSavPl89z10M5Td+iF/uMo81RLg2Hnoh/YsPZC2kR5TKLBesao3MabMmp8VHjOxYc8cVf/vlL3VyjhVGffKlN1/o8x6pZ+Ed+aVKRf4zPk3gbwqgAplbmRzdHJlYW0KZW5kb2JqCgoxMiAwIG9iago8PAovU2l6ZSAxMwovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDUzCi9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDEzIF0KPj4Kc3RyZWFtCnicY2Bg+P+fiYGbgQFEMIIIJhDBDCJYGBkEIBKsjAxvICw2RsZjDECFC4AEy1wGBgC0lwV6CmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgoxMTgxCiUlRU9G";
const TWO_PAGE_SCAN_PDF = "JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxNTQKPj4Kc3RyZWFtCnicrU3LCgIxDLznK3oWxKabznRBPChdPHgR+gMiKooeFPH7za6/IGEg88jkKesmMYzzushie7p/Tu/r8TBn7IuVyNIH1dDOkiy0negU1WAx0NEesrQKpaEnkFMEfEvsaCkyQsFRJV01FPczKgZm150xOVeYI2Ez3XcYUGnuKH4thswybZ7m2DD+y/ibsgrtJm0mtclevuPaOgYKZW5kc3RyZWFtCmVuZG9iagoKOCAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDYKL0ZpcnN0IDMyCi9MZW5ndGggMzc0Cj4+CnN0cmVhbQp4nNVSTUvDQBC976+Yox5kJ5t0k0gp9CNRkKK0gqJ4SJOlRMquJFup/96ZpK30oOJRwsvuzLz5Sl4ACAoGCCEkEUQwCBMYgFYIMcRpCsOhkPcfbwbkXbE2rZA3ddXCM3EQFsTh94uQU7e1HpQYjcRXxrTwxcatRZ8KAZMPjLvGVdvSNDDMszxHjBFRRwSNqGZ0TgkpQZFNMZXQnRBHe5AvDhHDMcXyHjruczjecQf7/IxO4mrmzHpulPT2sS/3yvoa6rd50pGQc1fNCm/gbHapUGlMlA6iMI2Cp3P6HI0pvPu/y3Xz185+u+HJf86d9UIutyvfmewMhJwUreEIyGuzeTe+LgshM1u6qrZrkA+1Hdu2PjhOK7JgWDaNofxeN3JhWrdtShIS87rKfDkWv4gxTWjzOElJx3upycfb1aspOyqb2c5fLT1v1TvYNzdVXUzcjlSN9OhAkfIVq3psrfOs9k7h1tM0bOm96v828o+tKPgJpUfcBQplbmRzdHJlYW0KZW5kb2JqCgo5IDAgb2JqCjw8Ci9TaXplIDEwCi9Sb290IDIgMCBSCi9JbmZvIDMgMCBSCi9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9UeXBlIC9YUmVmCi9MZW5ndGggNDMKL1cgWyAxIDIgMiBdCi9JbmRleCBbIDAgMTAgXQo+PgpzdHJlYW0KeJxjYGD4/5+JgYOBAUQwgggmEMEMIlgYGQQgEqyMDJ8ZgNLnGRgAcGwEIQplbmRzdHJlYW0KZW5kb2JqCgpzdGFydHhyZWYKNzE5CiUlRU9G";

function syntheticPdf(pageTexts: string[]) {
  return Buffer.from(pageTexts.length === 3 ? THREE_PAGE_PDF : TWO_PAGE_SCAN_PDF, "base64");
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function minimalZip(files: Record<string, string>) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, contents] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(contents);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
}

function syntheticDocx() {
  return minimalZip({
    "[Content_Types].xml": "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>",
    "_rels/.rels": "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>",
    "word/document.xml": "<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Renewal date is 2030-12-31.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Annual fee USD 120000</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>"
  });
}

function field(overrides: Partial<ContractExtractedField>): ContractExtractedField {
  return {
    id: crypto.randomUUID(),
    organization_id: "org-1",
    contract_id: "contract-1",
    extraction_run_id: "run-1",
    field_key: "contract_value_amount",
    extracted_value: 120000,
    normalized_value: 120000,
    confidence: 0.95,
    evidence_status: "accepted",
    source_file_id: "file-1",
    source_page: 1,
    source_snippet: "Annual fee USD 120000",
    source_offsets: null,
    warning_codes: [],
    reviewed_by_user_id: "user-1",
    reviewed_at: "2030-01-01T00:00:00.000Z",
    applied_to_contract_at: null,
    rejected_at: null,
    rejection_reason: null,
    created_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

function relationship(overrides: Partial<ContractDocumentRelationship> = {}): ContractDocumentRelationship {
  return {
    id: "relationship-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    source_file_id: "amendment",
    target_file_id: "msa",
    relationship_type: "amends",
    effective_date: "2030-01-01",
    confidence: 1,
    evidence_status: "accepted",
    evidence_field_ids: [],
    reviewed_by_user_id: "reviewer-1",
    reviewed_at: "2030-01-02T00:00:00.000Z",
    created_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("full-document contract intelligence", () => {
  it("parses real multi-page PDF bytes and preserves page evidence", async () => {
    const buffer = syntheticPdf([
      "MASTER SUBSCRIPTION AGREEMENT - effective date 2030-01-01",
      "The subscription renews automatically on 2031-01-01.",
      "Annual fees are USD 120000 and increase by 5 percent."
    ]);
    const pdfPageExtractor = vi.fn(async (received: Buffer) => {
      expect(received.equals(buffer)).toBe(true);
      return [
        { pageNumber: 1, text: "MASTER SUBSCRIPTION AGREEMENT - effective date 2030-01-01", textHash: "one", extractionMethod: "native_pdf" as const, ocrConfidence: null, blocks: [], warningCodes: [] },
        { pageNumber: 2, text: "The subscription renews automatically on 2031-01-01.", textHash: "two", extractionMethod: "native_pdf" as const, ocrConfidence: null, blocks: [], warningCodes: [] },
        { pageNumber: 3, text: "Annual fees are USD 120000 and increase by 5 percent.", textHash: "three", extractionMethod: "native_pdf" as const, ocrConfidence: null, blocks: [], warningCodes: [] }
      ];
    });
    const document = await parseContractDocument({ fileId: "file-1", buffer, mimeType: "application/pdf", pdfPageExtractor });
    expect(document.pages).toHaveLength(3);
    expect(document.pages[1]?.pageNumber).toBe(2);
    expect(document.pages[2]?.text).toContain("USD 120000");
    expect(new Set(document.pages.map((page) => page.textHash)).size).toBe(3);
  });

  it("extracts DOCX paragraphs and table text from real package bytes", async () => {
    const document = await parseContractDocument({
      fileId: "file-docx",
      buffer: syntheticDocx(),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    expect(document.pages[0]?.extractionMethod).toBe("docx");
    expect(document.pages[0]?.text).toContain("Renewal date is 2030-12-31");
    expect(document.pages[0]?.text).toContain("Annual fee USD 120000");
  });

  it("routes only weak PDF pages through OCR and preserves native pages", async () => {
    const buffer = syntheticPdf(["Native first page with enough readable contract text. ".repeat(3), ""]);
    const document = await parseContractDocument({
      fileId: "file-1",
      buffer,
      mimeType: "application/pdf",
      pdfPageExtractor: async () => [
        { pageNumber: 1, text: "Native first page with enough readable contract text. ".repeat(3), textHash: "one", extractionMethod: "native_pdf", ocrConfidence: null, blocks: [], warningCodes: [] },
        { pageNumber: 2, text: "", textHash: "two", extractionMethod: "native_pdf", ocrConfidence: null, blocks: [], warningCodes: ["native_page_text_insufficient"] }
      ]
    });
    const performOcr = vi.fn().mockResolvedValue({
      status: "completed",
      provider: "test",
      processingMode: "sync",
      text: "Scanned page says notice must be given 30 days before renewal.",
      averageConfidence: 0.9,
      pages: [],
      estimatedCost: null
    });
    const result = await applySelectiveOcrFallback({
      document,
      originalPdf: buffer,
      fileName: "synthetic.pdf",
      provider: { name: "test", performOcr } satisfies OcrProvider
    });
    expect(performOcr).toHaveBeenCalledTimes(1);
    expect(result.pages[0]?.extractionMethod).toBe("native_pdf");
    expect(result.pages[1]?.extractionMethod).toBe("ocr");
    expect(result.pages[1]?.ocrConfidence).toBe(0.9);
  });

  it("rejects corrupt, spoofed, and empty documents with safe codes", async () => {
    await expect(parseContractDocument({ fileId: "x", buffer: Buffer.from("not pdf"), mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "file_signature_mismatch" } satisfies Partial<ContractDocumentParseError>);
    await expect(parseContractDocument({ fileId: "x", buffer: Buffer.alloc(0), mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "empty_document" } satisfies Partial<ContractDocumentParseError>);
  });

  it("processes complete documents beyond 15,000 characters in bounded chunks", async () => {
    const calls: number[] = [];
    const provider: CommercialExtractionProvider = {
      providerName: "test",
      modelName: "test-model",
      async extractChunk({ chunk }) {
        calls.push(chunk.text.length);
        return { fields: [], warnings: [], inputTokens: 1, outputTokens: 1, model: "test-model" };
      }
    };
    const text = "Commercial terms and pricing. ".repeat(1200);
    const document: ParsedContractDocument = {
      fileId: "file-1",
      mimeType: "application/pdf",
      sizeBytes: text.length,
      warnings: [],
      pages: [{ pageNumber: 1, text, textHash: "hash", extractionMethod: "native_pdf", ocrConfidence: null, blocks: [], warningCodes: [] }]
    };
    const result = await extractFullCommercialDocument({ document, provider, chunkTimeoutMs: 5_000 });
    expect(result.inputCharacterCount).toBeGreaterThan(15_000);
    expect(calls.length).toBeGreaterThan(1);
    expect(Math.max(...calls)).toBeLessThanOrEqual(12_000);
    expect(result.status).toBe("completed");
    expect(buildDocumentChunks(document.pages).map((chunk) => chunk.pageNumber)).toEqual(calls.map(() => 1));
  });

  it("retries transient chunk failures and reports terminal partial success", async () => {
    let attempts = 0;
    const text = "Terms ".repeat(30);
    const document: ParsedContractDocument = {
      fileId: "file-1",
      mimeType: "application/pdf",
      sizeBytes: text.length,
      warnings: [],
      pages: [{ pageNumber: 1, text, textHash: "hash", extractionMethod: "native_pdf", ocrConfidence: null, blocks: [], warningCodes: [] }]
    };
    const provider: CommercialExtractionProvider = {
      providerName: "test",
      modelName: "test-model",
      async extractChunk() {
        attempts += 1;
        throw new Error("sensitive provider payload must not escape");
      }
    };
    const result = await extractFullCommercialDocument({ document, provider, maxAttemptsPerChunk: 2, chunkTimeoutMs: 5_000 });
    expect(attempts).toBe(2);
    expect(result.status).toBe("partial");
    expect(result.warnings).toContain("provider_chunk_retry");
    expect(JSON.stringify(result)).not.toContain("sensitive provider payload");
  });

  it("calculates exposure only from reviewed, currency-consistent evidence", () => {
    const fields = [
      field({ id: "amount", field_key: "contract_value_amount", normalized_value: 10000 }),
      field({ id: "currency", field_key: "contract_value_currency", normalized_value: "USD" }),
      field({ id: "period", field_key: "billing_frequency", normalized_value: "monthly" }),
      field({ id: "auto", field_key: "auto_renewal", normalized_value: true }),
      field({ id: "deadline", field_key: "notice_deadline_date", normalized_value: "2030-01-20" }),
      field({ id: "uplift", field_key: "fixed_uplift_percentage", normalized_value: 5 })
    ];
    const analysis = buildCommercialAnalysis(fields, new Date("2030-01-01T00:00:00Z"));
    expect(analysis.calculations.find((item) => item.calculationType === "normalized_annual_cost"))
      .toMatchObject({ status: "confirmed", amount: 120000, currency: "USD" });
    expect(analysis.calculations.find((item) => item.calculationType === "price_increase_exposure"))
      .toMatchObject({ status: "confirmed", amount: 6000, percentage: 5 });
    expect(analysis.findings.map((item) => item.reasonCode)).toContain("automatic_renewal_exposure");
    expect(analysis.findings.every((item) => !item.explanation.toLowerCase().includes("realized savings"))).toBe(true);
  });

  it("calculates deadline urgency in the organization timezone", () => {
    const analysis = buildCommercialAnalysis(
      [field({ id: "deadline", field_key: "notice_deadline_date", normalized_value: "2030-01-02" })],
      new Date("2030-01-02T01:00:00Z"),
      "America/Los_Angeles"
    );
    expect(analysis.calculations.find((item) => item.calculationType === "days_until_last_safe_action"))
      .toMatchObject({ amount: 1, status: "confirmed", warningCodes: [] });
  });

  it("blocks calculations and surfaces conflicts instead of silently applying precedence", () => {
    const fields = [
      field({ id: "a", source_file_id: "msa", field_key: "contract_value_amount", normalized_value: 10000, evidence_status: "pending_review" }),
      field({ id: "b", source_file_id: "amendment", field_key: "contract_value_amount", normalized_value: 12000, evidence_status: "pending_review" }),
      field({ id: "currency", field_key: "contract_value_currency", normalized_value: "USD" }),
      field({ id: "period", field_key: "billing_frequency", normalized_value: "monthly" })
    ];
    const analysis = buildCommercialAnalysis(fields);
    expect(analysis.conflicts[0]).toMatchObject({ fieldKey: "contract_value_amount", status: "unresolved" });
    expect(analysis.findings.map((item) => item.reasonCode)).toContain("insufficient_evidence_for_commercial_decision");
  });

  it("uses only reviewed relationship evidence to resolve accepted amendment precedence", () => {
    const fields = [
      field({ id: "msa-amount", source_file_id: "msa", field_key: "contract_value_amount", normalized_value: 10_000 }),
      field({ id: "amendment-amount", source_file_id: "amendment", field_key: "contract_value_amount", normalized_value: 12_000 }),
      field({ id: "currency", source_file_id: "amendment", field_key: "contract_value_currency", normalized_value: "USD" }),
      field({ id: "period", source_file_id: "amendment", field_key: "billing_frequency", normalized_value: "monthly" })
    ];
    const reviewed = buildCommercialAnalysis(fields, new Date("2030-02-01T00:00:00Z"), "UTC", [relationship()]);
    expect(reviewed.conflicts[0]).toMatchObject({
      status: "supported_precedence",
      selectedCandidateId: "amendment-amount",
      supportingRelationshipIds: ["relationship-1"]
    });
    expect(reviewed.calculations.find((item) => item.calculationType === "normalized_annual_cost"))
      .toMatchObject({ status: "confirmed", amount: 144_000 });

    const pending = buildCommercialAnalysis(fields, undefined, "UTC", [
      relationship({ evidence_status: "pending_review", reviewed_by_user_id: null, reviewed_at: null })
    ]);
    expect(pending.conflicts[0]).toMatchObject({ status: "unresolved", selectedCandidateId: null });
    expect(pending.calculations.find((item) => item.calculationType === "normalized_annual_cost"))
      .toMatchObject({ status: "conflict", amount: null });
  });

  it("calculates remaining, unit, renewal-term, and termination exposure from reviewed inputs", () => {
    const fields = [
      field({ id: "annual", field_key: "committed_annual_cost", normalized_value: 120_000 }),
      field({ id: "total", field_key: "total_committed_cost", normalized_value: 240_000 }),
      field({ id: "currency", field_key: "contract_value_currency", normalized_value: "USD" }),
      field({ id: "effective", field_key: "effective_date", normalized_value: "2030-01-01" }),
      field({ id: "expiration", field_key: "expiration_date", normalized_value: "2032-01-01" }),
      field({ id: "quantity", field_key: "quantities", normalized_value: 100 }),
      field({ id: "renewal-term", field_key: "renewal_term", normalized_value: "24 months" }),
      field({ id: "termination-fee", field_key: "early_termination_fees", normalized_value: 25_000 })
    ];
    const analysis = buildCommercialAnalysis(fields, new Date("2031-01-01T00:00:00Z"), "UTC");
    expect(analysis.calculations.find((item) => item.calculationType === "remaining_committed_cost"))
      .toMatchObject({ status: "estimate", amount: 120_000, currency: "USD" });
    expect(analysis.calculations.find((item) => item.calculationType === "effective_unit_price"))
      .toMatchObject({ status: "confirmed", amount: 1_200, currency: "USD" });
    expect(analysis.calculations.find((item) => item.calculationType === "renewal_term_exposure"))
      .toMatchObject({ status: "estimate", amount: 240_000, currency: "USD" });
    expect(analysis.calculations.find((item) => item.calculationType === "termination_cost_exposure"))
      .toMatchObject({ status: "confirmed", amount: 25_000, currency: "USD" });
    expect(analysis.findings.map((item) => item.reasonCode)).toContain("early_termination_cost_exposure");
  });

  it("surfaces reviewed commitment and chronology risks without inventing legal conclusions", () => {
    const fields = [
      field({ id: "minimum", field_key: "minimum_spend", normalized_value: 50_000 }),
      field({ id: "currency", field_key: "contract_value_currency", normalized_value: "USD" }),
      field({ id: "discount", field_key: "discount_expiration", normalized_value: "2030-06-01" }),
      field({ id: "expiration", field_key: "expiration_date", normalized_value: "2030-12-31" }),
      field({ id: "renewal", field_key: "renewal_date", normalized_value: "2030-01-01" }),
      field({ id: "notice", field_key: "notice_deadline_date", normalized_value: "2030-02-01" })
    ];
    const analysis = buildCommercialAnalysis(fields, new Date("2029-01-01T00:00:00Z"), "UTC");
    expect(analysis.findings.map((item) => item.reasonCode)).toEqual(expect.arrayContaining([
      "minimum_spend_commitment",
      "discount_expiration_exposure",
      "termination_right_not_confirmed",
      "inconsistent_commercial_dates"
    ]));
    expect(analysis.findings.find((item) => item.reasonCode === "termination_right_not_confirmed")?.limitations)
      .toContain("Absence of reviewed evidence does not prove that no termination right exists.");
  });

  it("adds tenant scope, RLS, lifecycle, retention, and safe evidence constraints", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/202608260001_full_document_commercial_intelligence.sql"), "utf8");
    expect(migration).toContain("contract_document_pages");
    expect(migration).toContain("status in ('queued', 'processing', 'completed', 'partial', 'failed', 'cancelled')");
    expect(migration).toContain("retention_expires_at");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("contract intelligence organization scope mismatch");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function public.enforce_contract_intelligence_scope() from anon");
    expect(migration).toContain("purge_expired_contract_document_pages");
    expect(migration).toContain("grant execute on function public.purge_expired_contract_document_pages() to service_role");
  });

  it("keeps the deterministic Python extractor deprecated and out of runtime truth", () => {
    const pythonRoute = readFileSync(join(process.cwd(), "services/python-intelligence/app/routes/extract_contract.py"), "utf8");
    const runtimeRunner = readFileSync(join(process.cwd(), "lib/contract-intelligence/python-extraction-runner.ts"), "utf8");
    expect(pythonRoute).toContain("deprecated_not_runtime_extraction_source");
    expect(runtimeRunner).toContain("OpenAiCommercialExtractionProvider");
    expect(runtimeRunner).not.toContain("extractContract(");
  });
});
