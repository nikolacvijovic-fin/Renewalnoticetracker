import {
  createAndRunQuoteComparisonFormAction,
  createReviewedCommercialBaselineFormAction,
  uploadAndRunCommercialProposalFormAction,
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

        <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 md:grid-cols-3">
          <p><span className="font-semibold text-slate-900">Reviewed fact:</span> accepted baseline evidence only</p>
          <p><span className="font-semibold text-slate-900">Calculation:</span> deterministic cost attribution</p>
          <p><span className="font-semibold text-slate-900">Opportunity:</span> estimate, never realized savings</p>
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
        <div className="space-y-4">
          <ServerActionForm
            serverAction={createReviewedCommercialBaselineFormAction.bind(null, contractId)}
            className="rounded-2xl border border-blue-200 bg-blue-50 p-4"
          >
            <h4 className="text-sm font-semibold text-blue-950">1. Lock reviewed commercial baseline</h4>
            <p className="mt-1 text-xs text-blue-800">
              Creates an immutable version from accepted extraction evidence. Later material changes create a new version.
            </p>
            <Button type="submit" className="mt-3">Create reviewed baseline version</Button>
          </ServerActionForm>
          <ServerActionForm
            serverAction={uploadAndRunCommercialProposalFormAction.bind(null, contractId)}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <h4 className="text-sm font-semibold text-ink">2. Upload renewal offer</h4>
            <p className="mt-1 text-xs text-slate-500">
              PDF and DOCX reuse full-document extraction. XLSX line items retain sheet and cell citations. All extracted proposal facts require review.
            </p>
            <input
              type="file"
              name="proposal_file"
              required
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,.docx,.xlsx"
              className="mt-3 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
            <Button type="submit" className="mt-3">Upload and compare proposal</Button>
          </ServerActionForm>
          <ServerActionForm
            serverAction={createAndRunQuoteComparisonFormAction.bind(null, contractId)}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
          <h4 className="text-sm font-semibold text-ink">Or enter proposal evidence manually</h4>
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
              Product
              <input name="product_name" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Platform subscription" />
            </label>
            <label className="text-sm text-slate-600">
              SKU
              <input name="sku" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Optional reviewed SKU" />
            </label>
            <label className="text-sm text-slate-600">
              Quantity
              <input name="quantity" inputMode="decimal" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-600">
              Unit price
              <input name="unit_price" inputMode="decimal" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-600">
              Payment terms
              <input name="payment_terms" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Net 30" />
            </label>
            <label className="text-sm text-slate-600">
              Term months
              <input name="term_months" inputMode="numeric" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="12" />
            </label>
            <label className="text-sm text-slate-600">
              Billing period
              <select name="billing_period" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="annual">Annual</option>
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
                <option value="multi_year">Multi-year</option>
                <option value="partial">Partial period</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Discount amount
              <input name="discount_amount" inputMode="decimal" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-600">
              Discount percent
              <input name="discount_percent" inputMode="decimal" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Manual proposal facts remain proposed evidence until reviewed. No quote terms overwrite the contract baseline.
          </p>
          <Button type="submit" className="mt-4">
            Run quote comparison
          </Button>
          </ServerActionForm>
        </div>
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
