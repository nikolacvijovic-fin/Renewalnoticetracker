import {
  applyAcceptedExtractionFieldsFormAction,
  editExtractedFieldFormAction,
  reprocessContractExtractionFormAction,
  reviewExtractedFieldFormAction
} from "@/lib/actions/contracts";
import type {
  ContractDocumentRelationship,
  ContractExtractedField,
  ContractExtractionRun
} from "@/lib/contract-intelligence/extraction-types";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { formatDate, formatPercent } from "@/lib/utils";
import { CustomerFeedbackPanel } from "@/components/customer-feedback/customer-feedback-panel";
import { CommercialAnalysisPanel } from "@/components/contracts/commercial-analysis-panel";

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
  canReview,
  currentRoute,
  organizationTimezone,
  relationships = []
}: {
  contractId: string;
  runs: ContractExtractionRun[];
  fields: ContractExtractedField[];
  canReview: boolean;
  currentRoute?: string;
  organizationTimezone?: string | null;
  relationships?: ContractDocumentRelationship[];
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
        {canReview ? (
          <ServerActionForm
            serverAction={reprocessContractExtractionFormAction.bind(null, contractId)}
            className="mt-4"
          >
            <Button type="submit" variant="secondary">Re-run full document extraction</Button>
          </ServerActionForm>
        ) : null}
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
            <div
              key={field.id}
              data-testid={`extracted-field-${field.field_key}`}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {(field.field_category ?? "term_and_renewal").replaceAll("_", " ")}
                  </p>
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
                <p className="mt-3 text-sm text-amber-700">No evidence snippet found for this field.</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {field.source_page ? <span>Page {field.source_page}</span> : <span>Page unavailable</span>}
                {field.source_section_label ? <span>Section: {field.source_section_label}</span> : null}
                {field.source_clause_label ? <span>Clause: {field.source_clause_label}</span> : null}
                {field.extraction_method ? <span>Method: {field.extraction_method.replaceAll("_", " ")}</span> : null}
                {field.source_file_id ? (
                  <a
                    className="font-semibold text-blue-700 hover:underline"
                    href={`/api/contracts/${contractId}/files/${field.source_file_id}${field.source_page ? `?page=${field.source_page}` : ""}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open source evidence
                  </a>
                ) : null}
              </div>
              {field.warning_codes.length ? (
                <p className="mt-2 text-xs text-amber-700">
                  Warnings: {field.warning_codes.join(", ")}
                </p>
              ) : null}
              {canReview && field.evidence_status === "pending_review" ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
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
                  <ServerActionForm
                    serverAction={editExtractedFieldFormAction.bind(null, contractId, field.id)}
                    className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      name="edited_value"
                      required
                      defaultValue={formatValue(field.normalized_value ?? field.extracted_value)}
                      aria-label={`Corrected value for ${field.field_key}`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      name="override_reason"
                      required
                      maxLength={600}
                      placeholder="Reason for override"
                      aria-label={`Override reason for ${field.field_key}`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <Button type="submit" variant="secondary" className="px-3 py-2 text-xs">
                      Save reviewed value
                    </Button>
                  </ServerActionForm>
                </div>
              ) : null}
              <div className="mt-4">
                <CustomerFeedbackPanel
                  compact
                  title="Extraction looks wrong?"
                  description="Flag this field for founder/support review without changing trusted metadata."
                  defaultFeedbackType="extraction_problem"
                  contractId={contractId}
                  entityType="extracted_field"
                  entityId={field.id}
                  currentRoute={currentRoute ?? `/dashboard/contracts/${contractId}`}
                  fieldName={field.field_key}
                  reviewStatus={field.evidence_status}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No extraction evidence has been recorded for this contract yet.
        </p>
      )}
      <CommercialAnalysisPanel
        fields={fields}
        organizationTimezone={organizationTimezone}
        relationships={relationships}
      />
    </div>
  );
}
