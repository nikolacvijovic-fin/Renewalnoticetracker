import * as XLSX from "xlsx";
import { sanitizeSpreadsheetValue } from "@/lib/contracts/export";

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
  contractIds?: string[];
  providerNames?: string[];
};

export type ExecutiveValueReportInput = {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  contractsMonitored: number;
  protectedDeadlineCount: number;
  providerFreshness: Array<{ provider: string; lastSuccessfulSyncAt: string | null }>;
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
    !finding.isSample && !finding.resolvedAt && !finding.supersededAt && finding.reviewStatus !== "rejected"
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
  const reviewed = active.filter((finding) => finding.reviewStatus !== "open");
  const accepted = active.filter((finding) => ["accepted", "action_planned"].includes(finding.reviewStatus));
  return {
    organizationId: input.organizationId,
    reportingPeriod: { start: input.periodStart, end: input.periodEnd },
    generatedAt: input.generatedAt,
    contractsMonitored: Math.max(0, input.contractsMonitored),
    renewalDeadlinesProtected: Math.max(0, input.protectedDeadlineCount),
    recommendationsReviewed: reviewed.length,
    acceptedActions: accepted.length,
    rejectedAsIncorrect: input.findings.filter((finding) => finding.reviewStatus === "rejected").length,
    estimatedSavingsByCurrency: totalsByCurrency(active, "estimatedSavings"),
    realizedSavingsByCurrency: confirmedOutcomeTotals(input.confirmedOutcomes ?? []),
    providerFreshness: input.providerFreshness,
    upcomingActions: input.upcomingActions.slice(0, 20),
    evidenceLimitations: [
      "Realized savings include only customer-confirmed renewal outcomes with evidence.",
      "Provider usage is a decision aid, not proof that a subscription is unnecessary.",
      "Currencies are never combined without an explicit conversion source."
    ]
  };
}

function safeRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeSpreadsheetValue(value as string | number | boolean | null)])
  ));
}

export function buildExecutiveValueWorkbook(input: ExecutiveValueReportInput) {
  const summary = buildExecutiveValueSummary(input);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows([{
    period_start: summary.reportingPeriod.start,
    period_end: summary.reportingPeriod.end,
    contracts_monitored: summary.contractsMonitored,
    deadlines_protected: summary.renewalDeadlinesProtected,
    recommendations_reviewed: summary.recommendationsReviewed,
    accepted_actions: summary.acceptedActions,
    rejected_as_incorrect: summary.rejectedAsIncorrect
  }])), "Executive Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows(
    Object.entries(summary.estimatedSavingsByCurrency).map(([currency, amount]) => ({ currency, estimated_savings: amount }))
  )), "Estimated Savings");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows(
    Object.entries(summary.realizedSavingsByCurrency).map(([currency, amount]) => ({ currency, realized_savings: amount }))
  )), "Realized Savings");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows(
    summary.providerFreshness.map((item) => ({
      provider: item.provider,
      last_successful_sync_at: item.lastSuccessfulSyncAt
    }))
  )), "Provider Freshness");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows(
    summary.upcomingActions.map((action) => ({
      contract_reference: action.contractId,
      title: action.title,
      deadline: action.deadline
    }))
  )), "Upcoming Actions");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows(
    summary.evidenceLimitations.map((limitation) => ({ limitation }))
  )), "Evidence Limitations");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows(activeFindings(input.findings).map((finding) => ({
    finding_id: finding.id,
    finding_type: finding.findingType,
    review_status: finding.reviewStatus,
    confidence: finding.confidence,
    currency: finding.currency,
    estimated_savings: finding.estimatedSavings,
    realized_savings: finding.realizedSavings,
    contract_references: (finding.contractIds ?? []).slice(0, 10).join(", "),
    providers: (finding.providerNames ?? []).slice(0, 4).join(", ")
  })))), "Active Evidence");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildExecutiveValuePdf(input: ExecutiveValueReportInput) {
  const summary = buildExecutiveValueSummary(input);
  const money = (totals: Record<string, number>) => Object.entries(totals).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join("; ") || "No supported value recorded";
  const lines = [
    "NoticeControl Executive Value Summary",
    `Reporting period: ${summary.reportingPeriod.start} to ${summary.reportingPeriod.end}`,
    `Contracts monitored: ${summary.contractsMonitored}`,
    `Renewal deadlines protected: ${summary.renewalDeadlinesProtected}`,
    `Recommendations reviewed: ${summary.recommendationsReviewed}`,
    `Accepted actions: ${summary.acceptedActions}`,
    `Estimated savings: ${money(summary.estimatedSavingsByCurrency)}`,
    `Realized savings: ${money(summary.realizedSavingsByCurrency)}`,
    `Incorrect findings rejected: ${summary.rejectedAsIncorrect}`,
    "Evidence limitations:",
    ...summary.evidenceLimitations,
    "Upcoming renewal actions:",
    ...summary.upcomingActions.slice(0, 8).map((action) => `${action.title} - ${action.deadline ?? "deadline needs review"}`)
  ].slice(0, 34);
  const content = lines.map((line, index) => `BT /F1 11 Tf 50 ${760 - index * 20} Td (${escapePdf(line)}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(pdf, "utf8")); pdf += `${object}\n`; }
  const xref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
