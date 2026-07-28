import {
  createAndRunQuoteComparisonFormAction,
  createSavingsOpportunityFormAction,
  dismissSavingsOpportunityFormAction,
  reviewQuoteFindingFormAction
} from "@/lib/actions/contracts";
import type {
  RenewalQuoteComparison,
  RenewalQuoteFinding,
  SavingsOpportunity
} from "@/lib/quote-comparison/quote-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { formatDate } from "@/lib/utils";

function formatMoney(amount: number | null | undefined, currency?: string | null) {
  if (typeof amount !== "number") return "Not captured";
  return `${currency ?? "USD"} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function riskTone(risk: string): "default" | "warning" | "critical" | "success" | "urgent" {
  if (risk === "critical") return "critical";
  if (risk === "high") return "urgent";
  if (risk === "medium") return "warning";
  if (risk === "low" || risk === "info") return "success";
  return "default";
}

function readable(value: unknown) {
  if (value === null || value === undefined) return "Not captured";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function RenewalQuoteComparisonPanel({
  contractId,
  comparisons,
  findings,
  opportunities,
  canReview
}: {
  contractId: string;
  comparisons: RenewalQuoteComparison[];
  findings: RenewalQuoteFinding[];
  opportunities: SavingsOpportunity[];
  canReview: boolean;
}) {
  const latest = comparisons[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Renewal quote comparison
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Compare a renewal quote against the current contract baseline. Findings are review evidence only; they do not change contract truth automatically.
            </p>
          </div>
          <Badge tone={latest ? riskTone(latest.overall_risk_level) : "default"}>
            {latest ? latest.overall_risk_level.replaceAll("_", " ") : "No quote yet"}
          </Badge>
        </div>

        {latest ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
              <p className="mt-2 text-sm font-semibold text-ink">{latest.status.replaceAll("_", " ")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {formatMoney(latest.current_total_amount, latest.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Proposed</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {formatMoney(latest.proposed_total_amount, latest.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Delta</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {formatMoney(latest.price_delta_amount, latest.currency)}
                {latest.price_delta_percent === null ? "" : ` (${latest.price_delta_percent}%)`}
              </p>
            </div>
          </div>
        ) : null}

        {latest?.recommendation_summary ? (
          <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
            {latest.recommendation_summary}
          </p>
        ) : null}

        {latest?.safe_error_message ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {latest.safe_error_message}
          </p>
        ) : null}
      </div>

      {canReview ? (
        <ServerActionForm
          serverAction={createAndRunQuoteComparisonFormAction.bind(null, contractId)}
          className="rounded-2xl border border-slate-200 bg-white p-4"
        >
          <h4 className="text-sm font-semibold text-ink">Enter renewal quote evidence</h4>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-600">
              Proposed total amount
              <input name="proposed_total_amount" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-600">
              Currency
              <input name="currency" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="USD" />
            </label>
            <label className="text-sm text-slate-600">
              Payment terms
              <input name="payment_terms" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Net 30" />
            </label>
            <label className="text-sm text-slate-600">
              Renewal term
              <input name="renewal_term" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="12 months" />
            </label>
            <label className="text-sm text-slate-600">
              Discounts
              <input name="discounts" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="comma-separated" />
            </label>
            <label className="text-sm text-slate-600">
              SKUs
              <input name="skus" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="comma-separated" />
            </label>
          </div>
          <label className="mt-3 block text-sm text-slate-600">
            Optional short quote excerpt
            <textarea name="quote_text" className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Quote excerpts are sent to the configured deterministic comparison service but are not stored as raw quote text.
          </p>
          <Button type="submit" className="mt-4">
            Run quote comparison
          </Button>
        </ServerActionForm>
      ) : null}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Findings</h4>
        {findings.length ? (
          findings.map((finding) => (
            <div key={finding.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{finding.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{finding.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={riskTone(finding.severity)}>{finding.severity}</Badge>
                  <Badge>{finding.status}</Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                <p>Current: {readable(finding.current_value)}</p>
                <p>Proposed: {readable(finding.proposed_value)}</p>
                <p>Delta: {readable(finding.delta_value)}</p>
              </div>
              {canReview && finding.status === "open" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ServerActionForm serverAction={reviewQuoteFindingFormAction.bind(null, finding.id, "accepted")}>
                    <Button type="submit" className="px-3 py-2 text-xs">
                      Accept finding
                    </Button>
                  </ServerActionForm>
                  <ServerActionForm serverAction={reviewQuoteFindingFormAction.bind(null, finding.id, "dismissed")}>
                    <Button type="submit" className="px-3 py-2 text-xs" variant="secondary">
                      Dismiss
                    </Button>
                  </ServerActionForm>
                  <ServerActionForm serverAction={createSavingsOpportunityFormAction.bind(null, finding.id)}>
                    <Button type="submit" className="px-3 py-2 text-xs" variant="secondary">
                      Create savings opportunity
                    </Button>
                  </ServerActionForm>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No quote findings have been recorded for this contract yet.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Savings opportunities</h4>
        {opportunities.length ? (
          opportunities.map((opportunity) => (
            <div key={opportunity.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{opportunity.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Estimate: {formatMoney(opportunity.estimated_savings_amount, opportunity.currency)} |
                    Confidence {Math.round(opportunity.confidence * 100)}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Created {formatDate(opportunity.created_at)}</p>
                </div>
                <Badge>{opportunity.status.replaceAll("_", " ")}</Badge>
              </div>
              {canReview && opportunity.status === "open" ? (
                <ServerActionForm
                  serverAction={dismissSavingsOpportunityFormAction.bind(null, opportunity.id)}
                  className="mt-4 flex flex-wrap gap-2"
                >
                  <input type="hidden" name="reason" value="Dismissed during renewal quote evidence review." />
                  <Button type="submit" className="px-3 py-2 text-xs" variant="secondary">
                    Dismiss opportunity
                  </Button>
                </ServerActionForm>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No savings opportunities have been created from quote findings yet.
          </p>
        )}
      </div>
    </div>
  );
}
