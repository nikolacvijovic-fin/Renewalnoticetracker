import { updateContractReviewAction } from "@/lib/actions/contracts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { Textarea } from "@/components/ui/textarea";
import {
  PHASE1_P0_FIELDS,
  getPhase1ReviewMode,
  getPhase1TrustState,
  listPhase1ActiveReviewDirtyFlags,
  type Phase1P0Field
} from "@/lib/contracts/phase1-pilot";
import { formatPercent } from "@/lib/utils";

type Metadata = {
  contract_title: string | null;
  counterparty_name: string | null;
  contract_type: string | null;
  effective_date: string | null;
  renewal_date?: string | null;
  expiration_date: string | null;
  auto_renewal: boolean | null;
  has_conflict?: boolean | null;
  has_derived_date?: boolean | null;
  has_weak_evidence?: boolean | null;
  is_ocr_assisted?: boolean | null;
  is_manual_without_evidence?: boolean | null;
  changes_previously_verified_p0?: boolean | null;
  accepted_unverified_risk_requested?: boolean | null;
  renewal_term: string | null;
  notice_period_value: number | null;
  notice_period_unit: string | null;
  notice_deadline_date: string | null;
  termination_window?: string | null;
  governing_law: string | null;
  payment_terms: string | null;
  extracted_clauses: string[];
  field_confidence: Record<string, number>;
  field_source_snippets: Record<string, string>;
  reminder_recommendations: string[];
  reviewer_notes: string | null;
  needs_review: boolean;
  owner_user_id?: string | null;
  department?: string | null;
  status_tag?: string;
  renewal_decision_status?: string | null;
  renewal_decision_date?: string | null;
  cycle_status?: string | null;
};

type MemberOption = {
  user_id: string;
  label: string;
};

export function ReviewForm({
  contractId,
  metadata,
  members
}: {
  contractId: string;
  metadata: Metadata;
  members: MemberOption[];
}) {
  const action = updateContractReviewAction.bind(null, contractId);
  const reviewMode = getPhase1ReviewMode(metadata);
  const dirtyFlags = listPhase1ActiveReviewDirtyFlags(metadata);
  const trustState = getPhase1TrustState({
    owner_user_id: metadata.owner_user_id ?? null,
    renewal_decision_status: metadata.renewal_decision_status ?? "undecided",
    cycle_status: metadata.cycle_status ?? "open",
    contract_metadata: metadata
  });

  return (
    <ServerActionForm serverAction={action} className="panel space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Review P0 fields</h2>
          <p className="mt-1 text-sm text-slate-500">
            Confirm reviewed truth, assign one owner, and activate trusted reminders from the reviewed record.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-ink">
            {reviewMode === "fast_review" ? "Fast Review" : "Exception Review"}
          </p>
          <p className="mt-1">
            Current trust state: {trustState}.{" "}
            {reviewMode === "fast_review"
              ? "All current P0 fields have direct evidence and no dirty trust flags."
              : "Dirty trust flags require typed justification before reviewed truth can drive reminders."}
          </p>
        </div>
      </div>

      {metadata.is_ocr_assisted ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          OCR fallback was used. Every reminder-driving field stays lower-trust until a reviewer confirms the P0 record.
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium text-ink">Why this review is {reviewMode === "fast_review" ? "Fast" : "Exception"}</p>
          <p className="text-xs text-slate-500">
            Operational impact: reviewing P0 can supersede prior reminders and regenerate the trusted schedule.
          </p>
        </div>
        {dirtyFlags.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {dirtyFlags.map((flag) => (
              <li key={flag.key} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="font-medium text-amber-950">{flag.label}</p>
                <p className="mt-1 text-xs text-amber-900">{flag.impact}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            No dirty flags are active. Completing review will activate the trusted schedule once an owner is assigned.
          </p>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">P0 trust review</h3>
          <p className="text-xs text-slate-500">
            Confirming will regenerate reminders from reviewed truth.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {PHASE1_P0_FIELDS.map((field) => (
            <FieldCard key={field} field={field} metadata={metadata} />
          ))}
          <Field
            label="Owner assignment"
            description="Trusted reminders stay blocked until one accountable owner is assigned."
          >
            <select
              name="owner_user_id"
              defaultValue={metadata.owner_user_id ?? ""}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <Field
        label="Review outcome"
        description="Edit any field above before marking the review complete."
      >
        <select
          name="needs_review"
          defaultValue={metadata.needs_review ? "true" : "false"}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
        >
          <option value="false">Review complete</option>
          <option value="true">Keep in review</option>
        </select>
      </Field>

      <Field
        label="Exception review reason"
        description="Required for weak evidence, OCR-derived corrections, conflicts, or any override that changes reminder-driving truth."
      >
        <Textarea
          name="review_reason"
          defaultValue={metadata.reviewer_notes ?? ""}
          placeholder="Explain why the reviewed truth differs or why the contract must stay in review."
        />
      </Field>

      <Field
        label="Unverified risk override"
        description="Use only when you need to proceed despite unresolved trust issues. This forces Exception Review and requires a typed reason."
      >
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="accepted_unverified_risk_requested"
            value="true"
            defaultChecked={metadata.accepted_unverified_risk_requested ?? false}
          />
          Accept unverified risk for this review decision
        </label>
      </Field>

      <Field label="Reviewer notes">
        <Textarea
          name="reviewer_notes"
          defaultValue={metadata.reviewer_notes ?? ""}
          placeholder="Optional notes for the next operator or owner."
        />
      </Field>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-medium text-ink">Reminder impact</p>
        <p className="mt-1">
          {metadata.reminder_recommendations.length > 0
            ? metadata.reminder_recommendations[0]
            : "Completing review will activate notice, renewal, expiration, decision, and acknowledgment reminders when an owner is present."}
        </p>
      </div>

      <input type="hidden" name="review_mode" value={reviewMode} />
      <input
        type="hidden"
        name="has_conflict"
        value={metadata.has_conflict ? "true" : "false"}
      />
      <input
        type="hidden"
        name="has_derived_date"
        value={metadata.has_derived_date ? "true" : "false"}
      />
      <input
        type="hidden"
        name="has_weak_evidence"
        value={metadata.has_weak_evidence ? "true" : "false"}
      />
      <input
        type="hidden"
        name="is_ocr_assisted"
        value={metadata.is_ocr_assisted ? "true" : "false"}
      />
      <input
        type="hidden"
        name="is_manual_without_evidence"
        value={metadata.is_manual_without_evidence ? "true" : "false"}
      />
      <input
        type="hidden"
        name="changes_previously_verified_p0"
        value={metadata.changes_previously_verified_p0 ? "true" : "false"}
      />
      <input type="hidden" name="contract_title" value={metadata.contract_title ?? ""} />
      <input type="hidden" name="counterparty_name" value={metadata.counterparty_name ?? ""} />
      <input type="hidden" name="contract_type" value={metadata.contract_type ?? ""} />
      <input type="hidden" name="effective_date" value={metadata.effective_date ?? ""} />
      <input type="hidden" name="renewal_term" value={metadata.renewal_term ?? ""} />
      <input type="hidden" name="notice_period_value" value={metadata.notice_period_value ?? ""} />
      <input type="hidden" name="notice_period_unit" value={metadata.notice_period_unit ?? ""} />
      <input type="hidden" name="governing_law" value={metadata.governing_law ?? ""} />
      <input type="hidden" name="payment_terms" value={metadata.payment_terms ?? ""} />
      <input type="hidden" name="department" value={metadata.department ?? ""} />
      <input type="hidden" name="status_tag" value={metadata.status_tag ?? "active"} />
      <input
        type="hidden"
        name="field_confidence"
        value={JSON.stringify(metadata.field_confidence)}
      />
      <input
        type="hidden"
        name="field_source_snippets"
        value={JSON.stringify(metadata.field_source_snippets)}
      />
      <input
        type="hidden"
        name="reminder_recommendations"
        value={JSON.stringify(metadata.reminder_recommendations)}
      />
      <input
        type="hidden"
        name="extracted_clauses"
        value={JSON.stringify(metadata.extracted_clauses)}
      />
      <input
        type="hidden"
        name="renewal_decision_status"
        value={metadata.renewal_decision_status ?? "undecided"}
      />
      <input
        type="hidden"
        name="renewal_decision_date"
        value={metadata.renewal_decision_date ?? ""}
      />
      <Button type="submit">Save review</Button>
    </ServerActionForm>
  );
}

function FieldCard({ field, metadata }: { field: Phase1P0Field; metadata: Metadata }) {
  const label = field.replaceAll("_", " ");
  const description =
    field === "auto_renewal"
      ? `Confidence ${formatPercent(metadata.field_confidence[field])}`
      : `Confidence ${formatPercent(metadata.field_confidence[field])}`;

  if (field === "auto_renewal") {
    return (
      <Field label={label} description={description}>
        <select
          name="auto_renewal"
          defaultValue={
            metadata.auto_renewal === null ? "null" : metadata.auto_renewal ? "true" : "false"
          }
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
        >
          <option value="null">Not Found</option>
          <option value="true">Confirmed yes</option>
          <option value="false">Confirmed no</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Evidence: {metadata.field_source_snippets[field] ?? "No snippet captured"}
        </p>
      </Field>
    );
  }

  return (
    <Field label={label} description={description}>
      <Input
        name={field}
        type={field.includes("date") ? "date" : "text"}
        defaultValue={(metadata[field] as string | null | undefined) ?? ""}
      />
      <p className="mt-1 text-xs text-slate-500">
        Evidence: {metadata.field_source_snippets[field] ?? "No snippet captured"}
      </p>
    </Field>
  );
}
