import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import type { ParsedContractDocument } from "@/lib/contract-intelligence/document-parser";
import type { CommercialFieldCandidate } from "@/lib/contract-intelligence/commercial-schema";
import type {
  CommercialEvidenceReference,
  CommercialLineItemInput,
  CommercialTermsInput
} from "@/lib/quote-comparison/commercial-comparison-engine";

export const COMMERCIAL_PROPOSAL_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
] as const;

export type CommercialProposalDocumentType =
  | "renewal_quote"
  | "amendment"
  | "replacement_order_form"
  | "pricing_proposal"
  | "unknown_commercial_document";

export type ProposalIngestionResult = {
  documentType: CommercialProposalDocumentType;
  terms: CommercialTermsInput;
  warnings: string[];
  requiresReview: boolean;
};

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value.replace(/,/g, "")))) {
    return Number(value.replace(/,/g, ""));
  }
  return null;
}

function classifyText(value: string): CommercialProposalDocumentType {
  const text = value.toLowerCase().replace(/[_-]+/g, " ");
  if (/\bamendment\b|\bamends?\b/.test(text)) return "amendment";
  if (/replacement\s+order\s+form/.test(text)) return "replacement_order_form";
  if (/renewal\s+(?:quote|offer|order)/.test(text)) return "renewal_quote";
  if (/pricing\s+proposal|commercial\s+proposal/.test(text)) return "pricing_proposal";
  return "unknown_commercial_document";
}

export function classifyCommercialProposalDocument(input: {
  fileName: string;
  extractedText?: string | null;
}) {
  return classifyText(`${input.fileName} ${input.extractedText ?? ""}`);
}

export function proposalTextFromParsedDocument(document: ParsedContractDocument) {
  return document.pages.map((page) => page.text).join("\n");
}

function evidenceUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function proposalTermsFromCommercialCandidates(input: {
  fileId: string;
  extractionRunLabel: string;
  fileName: string;
  fields: CommercialFieldCandidate[];
}): ProposalIngestionResult {
  const best = new Map<string, CommercialFieldCandidate>();
  for (const field of input.fields) {
    const current = best.get(field.fieldKey);
    if (!current || field.confidence > current.confidence) best.set(field.fieldKey, field);
  }
  const value = (key: string) => best.get(key)?.normalizedValue ?? best.get(key)?.rawValue ?? null;
  const text = (key: string) => typeof value(key) === "string" ? String(value(key)).trim() : null;
  const numeric = (key: string) => numberValue(value(key));
  const selected = [...best.values()];
  const evidence = selected.map((field) => ({
    evidenceId: evidenceUuid(`${input.fileId}:${field.fieldKey}:${field.citation.pageNumber}:${field.citation.snippet ?? ""}`),
    sourceFileId: input.fileId,
    extractionRunId: input.extractionRunLabel,
    state: "proposed" as const,
    page: field.citation.pageNumber,
    label: field.citation.clauseLabel ?? field.citation.sectionLabel ?? field.fieldKey
  }));
  const amount = numeric("committed_annual_cost") ?? numeric("contract_value_amount") ?? numeric("recurring_fees");
  const currency = text("contract_value_currency")?.toUpperCase() ?? "";
  const quantity = numeric("quantities");
  const unitPrice = numeric("unit_prices");
  const productName = text("products") ?? text("contract_title") ?? "Renewal proposal";
  const warnings = [
    !amount && !(quantity != null && unitPrice != null) ? "missing_comparable_proposal_amount" : null,
    !/^[A-Z]{3}$/.test(currency) ? "missing_or_invalid_proposal_currency" : null,
    ...selected.flatMap((field) => field.warningCodes)
  ].filter((item): item is string => Boolean(item));
  const lineEvidence = evidence.filter((_reference, index) => [
    "committed_annual_cost", "contract_value_amount", "recurring_fees", "contract_value_currency",
    "quantities", "unit_prices", "products", "contract_title", "discounts"
  ].includes(selected[index]?.fieldKey ?? ""));
  const billing = text("billing_frequency")?.toLowerCase();
  const lineItems: CommercialLineItemInput[] = amount != null || (quantity != null && unitPrice != null) ? [{
    lineKey: text("products") ?? "proposal-total",
    productName,
    chargeType: "recurring",
    pricingModel: quantity != null && unitPrice != null ? "per_unit" : "flat",
    billingPeriod: billing === "monthly" || billing === "quarterly" || billing === "multi_year" || billing === "partial"
      ? billing : "annual",
    quantity,
    unitPrice,
    totalAmount: amount,
    currency,
    discountAmount: numeric("discounts"),
    evidence: lineEvidence.length > 0 ? lineEvidence : evidence
  }] : [];
  const extractedType = text("document_type")?.replace(/[_ -]+/g, "_") as CommercialProposalDocumentType | null;
  const documentType = extractedType && ["renewal_quote", "amendment", "replacement_order_form", "pricing_proposal"].includes(extractedType)
    ? extractedType : classifyCommercialProposalDocument({ fileName: input.fileName });
  return {
    documentType,
    terms: {
      lineItems,
      statedAnnualTotal: amount,
      statedCommitmentTotal: numeric("total_committed_cost"),
      currency,
      paymentTerms: text("payment_terms"),
      renewalTermMonths: numeric("renewal_term"),
      noticePeriodDays: numeric("notice_period"),
      autoRenewal: typeof value("auto_renewal") === "boolean" ? value("auto_renewal") as boolean : null,
      minimumSpend: numeric("minimum_spend"),
      terminationCharge: numeric("early_termination_fees"),
      upliftPercent: numeric("fixed_uplift_percentage"),
      upliftCapped: best.has("uplift_cap_percentage") ? true : null,
      serviceCreditPercent: numeric("service_level_credits"),
      evidence
    },
    warnings,
    requiresReview: true
  };
}

export function parseCommercialProposalSpreadsheet(input: {
  fileId: string;
  buffer: Buffer;
  fileName: string;
  extractionRunId: string;
}): ProposalIngestionResult {
  const workbook = XLSX.read(input.buffer, { type: "buffer", cellDates: false, cellFormula: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) throw new Error("proposal_spreadsheet_has_no_sheet");
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const headers = new Map<string, number>();
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
    const header = String(cell?.v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (header) headers.set(header, column);
  }
  const required = ["product_name", "currency"];
  if (required.some((header) => !headers.has(header))) throw new Error("proposal_spreadsheet_headers_missing");

  const read = (row: number, names: string[]) => {
    const column = names.map((name) => headers.get(name)).find((value) => value != null);
    if (column == null) return { value: null, cell: null };
    const cell = XLSX.utils.encode_cell({ r: row, c: column });
    return { value: normalized(sheet[cell]?.v ?? null), cell: `${sheetName}!${cell}` };
  };
  const lineItems: CommercialLineItemInput[] = [];
  const warnings: string[] = [];
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const product = read(row, ["product_name", "product", "description"]);
    if (!product.value) continue;
    const currency = read(row, ["currency"]);
    const sku = read(row, ["sku", "product_code"]);
    const quantity = read(row, ["quantity", "qty", "seats"]);
    const unitPrice = read(row, ["unit_price", "price_per_unit", "price_per_seat"]);
    const total = read(row, ["total_amount", "line_total", "annual_total"]);
    const billing = String(read(row, ["billing_period", "billing_frequency"]).value ?? "annual").toLowerCase();
    const evidence: CommercialEvidenceReference[] = [product, currency, sku, quantity, unitPrice, total]
      .filter((item) => item.cell)
      .map((item) => ({
        evidenceId: evidenceUuid(`${input.fileId}:${item.cell}`),
        sourceFileId: input.fileId,
        extractionRunId: input.extractionRunId,
        state: "proposed",
        cell: item.cell,
        label: "Proposal spreadsheet cell"
      }));
    const currencyCode = String(currency.value ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) warnings.push(`invalid_currency:row_${row + 1}`);
    lineItems.push({
      lineKey: String(sku.value ?? product.value),
      productName: String(product.value),
      sku: sku.value ? String(sku.value) : null,
      chargeType: String(read(row, ["charge_type"]).value ?? "recurring").toLowerCase() === "one_time" ? "one_time" : "recurring",
      pricingModel: quantity.value != null && unitPrice.value != null ? "per_unit" : "flat",
      billingPeriod: ["monthly", "quarterly", "annual", "multi_year", "partial"].includes(billing)
        ? billing as CommercialLineItemInput["billingPeriod"] : "annual",
      quantity: numberValue(quantity.value),
      unitPrice: numberValue(unitPrice.value),
      totalAmount: numberValue(total.value),
      currency: currencyCode,
      termMonths: numberValue(read(row, ["term_months"]).value),
      servicePeriodMonths: numberValue(read(row, ["service_period_months"]).value),
      discountAmount: numberValue(read(row, ["discount_amount"]).value),
      discountPercent: numberValue(read(row, ["discount_percent"]).value),
      evidence
    });
  }
  if (lineItems.length === 0) throw new Error("proposal_spreadsheet_has_no_line_items");
  const currencies = [...new Set(lineItems.map((item) => item.currency))];
  if (currencies.length > 1) warnings.push("multi_currency_requires_reviewed_exchange_rate");
  return {
    documentType: classifyCommercialProposalDocument({ fileName: input.fileName }),
    terms: { lineItems, currency: currencies.length === 1 ? currencies[0] : null, evidence: lineItems.flatMap((item) => item.evidence) },
    warnings,
    requiresReview: true
  };
}
