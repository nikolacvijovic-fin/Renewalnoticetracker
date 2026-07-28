import { applyAcceptedExtractionFieldsFormAction, reviewExtractedFieldFormAction } from "@/lib/actions/contracts";
import type {
  ContractExtractedField,
  ContractExtractionRun
} from "@/lib/contract-intelligence/extraction-types";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { formatDate, formatPercent } from "@/lib/utils";

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "Not found";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function confidenceTone(confidence: number) {
  if (confidence >= 0.85) return "text-emerald-700";
  if (confidence >= 0.75) return "text-amber-700";
  return "text-red-700";
}

export function ContractExtractionReviewPanel({
  contractId,
  runs,
  fields,
  canReview
}: {
  contractId: string;
  runs: ContractExtractionRun[];
  fields: ContractExtractedField[];
  canReview: boolean;
}) {
  const latestRun = runs[0] ?? null;
  const acceptedCount = fields.filter((field) => field.evidence_status === "accepted").length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Contract intelligence evidence
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Extraction is review evidence, not trusted contract truth. Accepted fields still keep the P0 record in review until a reviewer confirms it.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Latest run: {latestRun ? latestRun.status.replaceAll("_", " ") : "No run yet"}
            {latestRun?.created_at ? ` | ${formatDate(latestRun.created_at)}` : ""}
          </div>
        </div>
        {canReview && acceptedCount > 0 ? (
          <ServerActionForm
            serverAction={applyAcceptedExtractionFieldsFormAction.bind(null, contractId)}
            className="mt-4"
          >
            <Button type="submit" variant="secondary">
              Apply accepted evidence to metadata
            </Button>
          </ServerActionForm>
        ) : null}
      </div>

      {fields.length ? (
        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{field.field_key.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Extracted: {formatValue(field.normalized_value ?? field.extracted_value)}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className={confidenceTone(field.confidence)}>
                    Confidence {formatPercent(field.confidence)}
                  </p>
                  <p className="mt-1 text-slate-500">{field.evidence_status.replaceAll("_", " ")}</p>
                </div>
              </div>
              {field.source_snippet ? (
                <blockquote className="mt-3 rounded-xl border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {field.source_snippet}
                </blockquote>
              ) : (
                <p className="mt-3 text-sm text-amber-700">No citation snippet captured for this field.</p>
              )}
              {field.warning_codes.length ? (
                <p className="mt-2 text-xs text-amber-700">
                  Warnings: {field.warning_codes.join(", ")}
                </p>
              ) : null}
              {canReview && field.evidence_status === "pending_review" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ServerActionForm
                    serverAction={reviewExtractedFieldFormAction.bind(null, contractId, field.id, "accept")}
                  >
                    <Button type="submit" className="px-3 py-2 text-xs">
                      Accept evidence
                    </Button>
                  </ServerActionForm>
                  <ServerActionForm
                    serverAction={reviewExtractedFieldFormAction.bind(null, contractId, field.id, "reject")}
                  >
                    <input type="hidden" name="reason" value="Rejected during extraction evidence review." />
                    <Button type="submit" className="px-3 py-2 text-xs" variant="secondary">
                      Reject
                    </Button>
                  </ServerActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No extraction evidence has been recorded for this contract yet.
        </p>
      )}
    </div>
  );
}
