import type { NormalizedQuoteTerms, SafeQuoteCitation } from "@/lib/quote-comparison/quote-types";

const SAFE_TEXT_LIMIT = 220;
const SENSITIVE_VALUE_PATTERNS = [
  /-----BEGIN [^-]+-----/i,
  /\b(raw|full)\s+(quote|contract|ocr|payload|document)\b/i,
  /\b(secret|token|bearer|password|api[_ -]?key)\b/i
];

function boundedText(value: string, maxLength = SAFE_TEXT_LIMIT) {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (!singleLine) return null;
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength - 1)}...` : singleLine;
}

function isSensitiveString(value: string) {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeScalar(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (isSensitiveString(value)) return undefined;
    return boundedText(value);
  }
  return undefined;
}

export function sanitizeQuoteEvidence(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeQuoteEvidence(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value && typeof value === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/raw|payload|secret|token|storage|ocr|document|contract_text|quote_text/i.test(key)) {
        continue;
      }
      const sanitized = sanitizeQuoteEvidence(entry);
      if (sanitized !== undefined) {
        safe[key] = sanitized;
      }
    }
    return safe;
  }

  return sanitizeScalar(value);
}

export function sanitizeQuoteCitation(citation?: SafeQuoteCitation | null): SafeQuoteCitation | null {
  if (!citation) return null;
  return {
    sourceFileId: citation.sourceFileId ?? null,
    page: citation.page ?? null,
    snippet: typeof citation.snippet === "string" ? boundedText(citation.snippet, 180) : null,
    evidenceLabel: typeof citation.evidenceLabel === "string" ? boundedText(citation.evidenceLabel, 80) : null
  };
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return boundedText(value, 120);
}

function pickBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y"].includes(normalized)) return true;
    if (["false", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? boundedText(entry, 80) : null))
    .filter((entry): entry is string => Boolean(entry));
}

export function normalizeQuoteTerms(terms: Record<string, unknown> = {}): NormalizedQuoteTerms {
  return {
    totalAmount:
      pickNumber(terms.total_amount) ??
      pickNumber(terms.totalAmount) ??
      pickNumber(terms.contract_value_amount) ??
      pickNumber(terms.price),
    currency:
      pickString(terms.currency) ??
      pickString(terms.contract_value_currency) ??
      pickString(terms.proposed_currency),
    discounts: pickStringArray(terms.discounts),
    skuList: pickStringArray(terms.skus ?? terms.sku_list),
    paymentTerms: pickString(terms.payment_terms ?? terms.paymentTerms),
    renewalTerm: pickString(terms.renewal_term ?? terms.renewalTerm),
    autoRenewal: pickBoolean(terms.auto_renewal ?? terms.autoRenewal),
    noticeDeadlineDate: pickString(terms.notice_deadline_date ?? terms.noticeDeadlineDate)
  };
}

export function computePriceDelta(currentAmount: number | null, proposedAmount: number | null) {
  if (currentAmount === null || proposedAmount === null) {
    return {
      priceDeltaAmount: null,
      priceDeltaPercent: null
    };
  }

  const priceDeltaAmount = Number((proposedAmount - currentAmount).toFixed(2));
  const priceDeltaPercent =
    currentAmount > 0 ? Number(((priceDeltaAmount / currentAmount) * 100).toFixed(2)) : null;

  return {
    priceDeltaAmount,
    priceDeltaPercent
  };
}
