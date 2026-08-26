import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizeSpreadsheetValue } from "@/lib/contracts/export";
import {
  classifySubscriptionFindingLifecycle,
  contributesAcceptedEstimatedSavings,
  isActiveSubscriptionFinding,
  isReviewedSubscriptionFinding
} from "@/lib/subscription-usage/finding-lifecycle";

export type ExecutiveValueFinding = {
  id: string;
  findingType: string;
  reviewStatus: string;
  estimatedSavings: number | null;
  realizedSavings: number | null;
  currency: string | null;
  confidence: number;
  isSample?: boolean;
  resolvedAt?: string | null;
  supersededAt?: string | null;
  feedbackClassification?: string | null;
  reviewedAt?: string | null;
  contractIds?: string[];
  providerNames?: string[];
};

export type ExecutiveValueReportInput = {
  organizationId: string;
  organizationName?: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  contractsMonitored: number;
  protectedDeadlineCount: number;
  providerFreshness: Array<{ connectionId?: string | null; provider: string; lastSuccessfulSyncAt: string | null }>;
  upcomingActions: Array<{ contractId: string; title: string; deadline: string | null }>;
  findings: ExecutiveValueFinding[];
  confirmedOutcomes?: Array<{
    id: string;
    realizedSavings: number | null;
    currency: string | null;
    renewalCompletedAt: string;
  }>;
};

function activeFindings(findings: ExecutiveValueFinding[]) {
  return findings.filter((finding) =>
    !finding.isSample
    && isActiveSubscriptionFinding({ reviewStatus: finding.reviewStatus, resolvedAt: finding.resolvedAt, supersededAt: finding.supersededAt })
    && finding.reviewStatus !== "rejected"
  );
}

function totalsByCurrency(findings: ExecutiveValueFinding[], key: "estimatedSavings" | "realizedSavings") {
  const totals: Record<string, number> = {};
  for (const finding of findings) {
    const amount = finding[key];
    if (!finding.currency || amount === null || !Number.isFinite(amount) || amount <= 0) continue;
    totals[finding.currency] = Math.round(((totals[finding.currency] ?? 0) + amount) * 100) / 100;
  }
  return totals;
}

function confirmedOutcomeTotals(outcomes: NonNullable<ExecutiveValueReportInput["confirmedOutcomes"]>) {
  const totals: Record<string, number> = {};
  for (const outcome of outcomes) {
    if (!outcome.currency || outcome.realizedSavings === null || !Number.isFinite(outcome.realizedSavings) || outcome.realizedSavings <= 0) continue;
    totals[outcome.currency] = Math.round(((totals[outcome.currency] ?? 0) + outcome.realizedSavings) * 100) / 100;
  }
  return totals;
}

export function buildExecutiveValueSummary(input: ExecutiveValueReportInput) {
  const active = activeFindings(input.findings);
  const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`).valueOf();
  const periodEnd = new Date(`${input.periodEnd}T23:59:59.999Z`).valueOf();
  const inPeriod = (value: string | null | undefined) => {
    if (!value) return false;
    const timestamp = new Date(value).valueOf();
    return Number.isFinite(timestamp) && timestamp >= periodStart && timestamp <= periodEnd;
  };
  const reviewed = active.filter((finding) => isReviewedSubscriptionFinding({ reviewStatus: finding.reviewStatus }));
  const accepted = active.filter((finding) => contributesAcceptedEstimatedSavings({ reviewStatus: finding.reviewStatus }));
  const estimatedFindings = active.filter((finding) => finding.reviewStatus !== "deferred");
  const outcomes = (input.confirmedOutcomes ?? []).filter((outcome) => inPeriod(outcome.renewalCompletedAt));
  return {
    organizationId: input.organizationId,
    reportingPeriod: { start: input.periodStart, end: input.periodEnd },
    generatedAt: input.generatedAt,
    contractsMonitored: Math.max(0, input.contractsMonitored),
    renewalDeadlinesProtected: Math.max(0, input.protectedDeadlineCount),
    recommendationsReviewed: reviewed.length,
    acceptedActions: accepted.length,
    rejectedAsIncorrect: input.findings.filter((finding) => finding.reviewStatus === "rejected" && finding.feedbackClassification === "incorrect").length,
    estimatedSavingsByCurrency: totalsByCurrency(estimatedFindings, "estimatedSavings"),
    realizedSavingsByCurrency: confirmedOutcomeTotals(outcomes),
    providerFreshness: [...new Map(input.providerFreshness.map((item) => [item.connectionId ?? `${item.provider}:${item.lastSuccessfulSyncAt ?? "missing"}`, item])).values()],
    upcomingActions: [...input.upcomingActions].sort((left, right) =>
      (left.deadline ?? "9999-12-31").localeCompare(right.deadline ?? "9999-12-31")
    ).slice(0, 20),
    evidenceLimitations: [
      "Realized savings include only customer-confirmed renewal outcomes with evidence.",
      "Provider usage is a decision aid, not proof that a subscription is unnecessary.",
      "Currencies are never combined without an explicit conversion source."
    ]
  };
}

function safeRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "number" || typeof value === "boolean"
        ? value
        : sanitizeSpreadsheetValue(value)
    ])
  ));
}

export function buildExecutiveValueWorkbook(input: ExecutiveValueReportInput) {
  const summary = buildExecutiveValueSummary(input);
  const workbook = XLSX.utils.book_new();
  const append = (name: string, rows: Array<Record<string, unknown>>, widths: number[]) => {
    const sheet = XLSX.utils.json_to_sheet(safeRows(rows));
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
    if (range) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
        if (!header) continue;
        header.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: "0F172A" } },
          alignment: { vertical: "center" }
        };
        const key = String(header.v ?? "");
        for (let row = 1; row <= range.e.r; row += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
          if (!cell) continue;
          if (/(amount|savings|cost)$/i.test(key) && cell.t === "n") cell.z = '#,##0.00;[Red]-#,##0.00';
          if (/(date|deadline|_at|period_start|period_end)$/i.test(key)) cell.z = "yyyy-mm-dd";
        }
      }
    }
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    sheet["!autofilter"] = sheet["!ref"] ? { ref: sheet["!ref"] } : undefined;
    sheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" } as never;
    sheet["!margins"] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  append("Executive Summary", [{
    period_start: summary.reportingPeriod.start,
    period_end: summary.reportingPeriod.end,
    contracts_monitored: summary.contractsMonitored,
    deadlines_protected: summary.renewalDeadlinesProtected,
    recommendations_reviewed: summary.recommendationsReviewed,
    accepted_actions: summary.acceptedActions,
    rejected_as_incorrect: summary.rejectedAsIncorrect
  }], [16, 16, 20, 20, 24, 18, 24]);
  append("Estimated Savings", Object.entries(summary.estimatedSavingsByCurrency).map(([currency, amount]) => ({ currency, estimated_savings: amount })), [12, 20]);
  append("Realized Savings", Object.entries(summary.realizedSavingsByCurrency).map(([currency, amount]) => ({ currency, realized_savings: amount })), [12, 20]);
  append("Provider Freshness",
    summary.providerFreshness.map((item) => ({
      provider: item.provider,
      last_successful_sync_at: item.lastSuccessfulSyncAt
    }))
  , [22, 28]);
  append("Upcoming Actions",
    summary.upcomingActions.map((action) => ({
      contract_reference: action.contractId,
      title: action.title,
      deadline: action.deadline
    }))
  , [38, 40, 16]);
  append("Evidence Limitations",
    summary.evidenceLimitations.map((limitation) => ({ limitation }))
  , [100]);
  append("Active Evidence", activeFindings(input.findings).map((finding) => ({
    finding_id: finding.id,
    finding_type: finding.findingType,
    review_status: finding.reviewStatus,
    confidence: finding.confidence,
    currency: finding.currency,
    estimated_savings: finding.estimatedSavings,
    realized_savings: finding.realizedSavings,
    contract_references: (finding.contractIds ?? []).slice(0, 10).join(", "),
    providers: (finding.providerNames ?? []).slice(0, 4).join(", ")
  })), [38, 28, 20, 14, 12, 20, 20, 40, 30]);
  append("Historical Evidence", input.findings.filter((finding) => !isActiveSubscriptionFinding({
    reviewStatus: finding.reviewStatus,
    resolvedAt: finding.resolvedAt,
    supersededAt: finding.supersededAt
  })).map((finding) => ({
    finding_id: finding.id,
    lifecycle: classifySubscriptionFindingLifecycle({ reviewStatus: finding.reviewStatus, resolvedAt: finding.resolvedAt, supersededAt: finding.supersededAt }),
    review_status: finding.reviewStatus,
    resolved_at: finding.resolvedAt ?? null,
    superseded_at: finding.supersededAt ?? null
  })), [38, 18, 18, 28, 28]);
  append("Confirmed Outcomes", (input.confirmedOutcomes ?? []).map((outcome) => ({
    outcome_id: outcome.id,
    renewal_completed_at: outcome.renewalCompletedAt,
    currency: outcome.currency,
    realized_savings: outcome.realizedSavings
  })), [38, 28, 12, 20]);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}

const PDF_PAGE = { width: 612, height: 792, margin: 44 } as const;
const PDF_COLORS = {
  ink: rgb(0.059, 0.09, 0.165),
  muted: rgb(0.278, 0.333, 0.412),
  border: rgb(0.886, 0.91, 0.941),
  surface: rgb(0.973, 0.98, 0.988),
  blue: rgb(0.145, 0.388, 0.922),
  white: rgb(1, 1, 1)
} as const;

function safePdfText(value: unknown, maximumLength = 240) {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (/(raw contract|ocr output|provider payload|private note|bearer\s|secret|storage path)/i.test(normalized)) {
    return "Sensitive content omitted";
  }
  return normalized.slice(0, maximumLength);
}

function wrapPdfText(text: string, font: PDFFont, size: number, maximumWidth: number) {
  const words = safePdfText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maximumWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["Not available"];
}

export async function buildExecutiveValuePdf(input: ExecutiveValueReportInput) {
  const summary = buildExecutiveValueSummary(input);
  const money = (totals: Record<string, number>) => Object.entries(totals).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join("; ") || "No supported value recorded";
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle("NoticeControl Executive Value Summary");
  document.setAuthor("NoticeControl");
  document.setSubject(`Evidence-backed renewal value report for ${safePdfText(input.organizationName || input.organizationId, 120)}`);
  const generatedAt = new Date(input.generatedAt);
  if (Number.isFinite(generatedAt.valueOf())) document.setCreationDate(generatedAt);

  let page!: PDFPage;
  let y = 0;
  const addPage = () => {
    page = document.addPage([PDF_PAGE.width, PDF_PAGE.height]);
    page.drawRectangle({ x: 0, y: PDF_PAGE.height - 72, width: PDF_PAGE.width, height: 72, color: PDF_COLORS.ink });
    page.drawText("NOTICECONTROL", { x: PDF_PAGE.margin, y: PDF_PAGE.height - 42, size: 11, font: bold, color: PDF_COLORS.white });
    page.drawText("Renewal evidence and value control", { x: PDF_PAGE.margin, y: PDF_PAGE.height - 57, size: 8, font: regular, color: rgb(0.75, 0.82, 0.93) });
    y = PDF_PAGE.height - 102;
  };
  const ensureSpace = (height: number) => {
    if (y - height < 54) addPage();
  };
  const drawLines = (text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const gap = options.gap ?? size + 4;
    const lines = wrapPdfText(text, font, size, options.width ?? PDF_PAGE.width - PDF_PAGE.margin * 2);
    ensureSpace(lines.length * gap);
    for (const line of lines) {
      page.drawText(line, { x: PDF_PAGE.margin, y, size, font, color: options.color ?? PDF_COLORS.ink });
      y -= gap;
    }
  };
  const section = (title: string) => {
    ensureSpace(34);
    y -= 8;
    page.drawText(safePdfText(title, 80), { x: PDF_PAGE.margin, y, size: 13, font: bold, color: PDF_COLORS.ink });
    y -= 8;
    page.drawLine({ start: { x: PDF_PAGE.margin, y }, end: { x: PDF_PAGE.width - PDF_PAGE.margin, y }, thickness: 1, color: PDF_COLORS.border });
    y -= 18;
  };
  const metric = (label: string, value: string, column: number, row: number) => {
    const width = 250;
    const height = 54;
    const x = PDF_PAGE.margin + column * (width + 16);
    const top = y - row * (height + 12);
    page.drawRectangle({ x, y: top - height, width, height, color: PDF_COLORS.surface, borderColor: PDF_COLORS.border, borderWidth: 1 });
    page.drawText(safePdfText(label, 55), { x: x + 12, y: top - 19, size: 8, font: bold, color: PDF_COLORS.muted });
    const display = safePdfText(value, 65);
    const valueSize = regular.widthOfTextAtSize(display, 13) > width - 24 ? 9 : 13;
    page.drawText(display, { x: x + 12, y: top - 40, size: valueSize, font: bold, color: PDF_COLORS.blue });
  };

  addPage();
  drawLines("Executive Value Summary", { size: 22, font: bold, gap: 27 });
  drawLines(safePdfText(input.organizationName || input.organizationId, 120), { size: 13, font: bold, color: PDF_COLORS.blue, gap: 18 });
  drawLines(`Reporting period: ${summary.reportingPeriod.start} to ${summary.reportingPeriod.end}`, { size: 9, color: PDF_COLORS.muted });
  y -= 8;
  ensureSpace(186);
  metric("Contracts monitored", String(summary.contractsMonitored), 0, 0);
  metric("Deadlines protected", String(summary.renewalDeadlinesProtected), 1, 0);
  metric("Recommendations reviewed", String(summary.recommendationsReviewed), 0, 1);
  metric("Accepted actions", String(summary.acceptedActions), 1, 1);
  metric("Estimated savings", money(summary.estimatedSavingsByCurrency), 0, 2);
  metric("Realized savings", money(summary.realizedSavingsByCurrency), 1, 2);
  y -= 190;
  section("Evidence basis");
  for (const limitation of summary.evidenceLimitations) drawLines(`- ${limitation}`, { size: 9, color: PDF_COLORS.muted, gap: 13 });

  addPage();
  section("Provider freshness");
  if (!summary.providerFreshness.length) drawLines("No provider freshness evidence was available for this reporting period.", { color: PDF_COLORS.muted });
  for (const item of summary.providerFreshness) {
    drawLines(`${safePdfText(item.provider, 60)}  |  ${item.lastSuccessfulSyncAt ? safePdfText(item.lastSuccessfulSyncAt, 40) : "No successful sync recorded"}`, { size: 9, gap: 14 });
  }
  section("Upcoming renewal actions");
  if (!summary.upcomingActions.length) drawLines("No upcoming renewal actions were recorded.", { color: PDF_COLORS.muted });
  for (const action of summary.upcomingActions) {
    ensureSpace(40);
    drawLines(safePdfText(action.title, 160), { size: 10, font: bold, gap: 14 });
    drawLines(`Deadline: ${action.deadline ?? "Needs review"}  |  Contract reference: ${safePdfText(action.contractId, 80)}`, { size: 8, color: PDF_COLORS.muted, gap: 13 });
    y -= 5;
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const footer = `Generated ${safePdfText(input.generatedAt, 40)}  |  Page ${index + 1} of ${pages.length}`;
    currentPage.drawLine({ start: { x: PDF_PAGE.margin, y: 42 }, end: { x: PDF_PAGE.width - PDF_PAGE.margin, y: 42 }, thickness: 0.7, color: PDF_COLORS.border });
    currentPage.drawText(footer, { x: PDF_PAGE.margin, y: 27, size: 7.5, font: regular, color: PDF_COLORS.muted });
  });

  return Buffer.from(await document.save({ useObjectStreams: false }));
}
