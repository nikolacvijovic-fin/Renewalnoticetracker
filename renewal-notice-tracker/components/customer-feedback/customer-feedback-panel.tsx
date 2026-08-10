import { submitCustomerFeedbackFormAction } from "@/lib/actions/customer-feedback";
import {
  CUSTOMER_FEEDBACK_SEVERITIES,
  CUSTOMER_FEEDBACK_TYPES,
  type CustomerFeedbackSeverity,
  type CustomerFeedbackType
} from "@/lib/customer-feedback/customer-feedback";
import { getRecentCustomerFeedbackForCurrentOrganization } from "@/lib/customer-feedback/queries";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { Textarea } from "@/components/ui/textarea";

const FEEDBACK_LABELS: Record<CustomerFeedbackType, string> = {
  deadline_correct: "Deadline is correct",
  deadline_incorrect: "Deadline is incorrect",
  extraction_problem: "Extraction problem",
  reminder_problem: "Reminder problem",
  upload_problem: "Upload problem",
  export_problem: "Export problem",
  billing_problem: "Billing problem",
  request_help: "Request founder help",
  other: "Other"
};

const SEVERITY_LABELS: Record<CustomerFeedbackSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
};

type CustomerFeedbackPanelProps = {
  title?: string;
  description?: string;
  defaultFeedbackType?: CustomerFeedbackType;
  contractId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  currentRoute: string;
  fieldName?: string | null;
  reviewStatus?: string | null;
  deadlineWindow?: string | null;
  exportType?: string | null;
  reminderType?: string | null;
  decisionStatus?: string | null;
  sourceSurface?: string | null;
  compact?: boolean;
};

function HiddenField({ name, value }: { name: string; value?: string | null }) {
  if (!value) return null;
  return <input type="hidden" name={name} value={value} />;
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export async function CustomerFeedbackPanel({
  title = "Need founder help?",
  description = "Send a short note from this workflow. NoticeControl includes only safe context, not raw contract text or provider payloads.",
  defaultFeedbackType = "request_help",
  contractId,
  entityType,
  entityId,
  currentRoute,
  fieldName,
  reviewStatus,
  deadlineWindow,
  exportType,
  reminderType,
  decisionStatus,
  sourceSurface,
  compact = false
}: CustomerFeedbackPanelProps) {
  const recentFeedback = await getRecentCustomerFeedbackForCurrentOrganization({
    contractId,
    limit: compact ? 3 : 5
  }).catch(() => []);

  return (
    <section className={compact ? "rounded-xl border border-slate-200 bg-slate-50 p-3" : "panel space-y-4 p-5"}>
      <div>
        <h3 className={compact ? "text-sm font-semibold text-slate-950" : "text-base font-semibold text-slate-950"}>
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <ServerActionForm serverAction={submitCustomerFeedbackFormAction} className="space-y-3">
        <HiddenField name="contract_id" value={contractId} />
        <HiddenField name="entity_type" value={entityType} />
        <HiddenField name="entity_id" value={entityId} />
        <HiddenField name="current_route" value={currentRoute} />
        <HiddenField name="field_name" value={fieldName} />
        <HiddenField name="review_status" value={reviewStatus} />
        <HiddenField name="deadline_window" value={deadlineWindow} />
        <HiddenField name="export_type" value={exportType} />
        <HiddenField name="reminder_type" value={reminderType} />
        <HiddenField name="decision_status" value={decisionStatus} />
        <HiddenField name="source_surface" value={sourceSurface} />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Type
            <select
              name="feedback_type"
              defaultValue={defaultFeedbackType}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {CUSTOMER_FEEDBACK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {FEEDBACK_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Severity
            <select
              name="severity"
              defaultValue="medium"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {CUSTOMER_FEEDBACK_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {SEVERITY_LABELS[severity]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Short message
          <Textarea
            name="message"
            maxLength={1000}
            placeholder="What looks wrong or where are you stuck?"
            className="mt-1 min-h-24"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary">
            Request founder help
          </Button>
          <span className="text-xs text-slate-500">
            Message is stored for support; audit logs keep only safe IDs, type, severity, and status.
          </span>
        </div>
      </ServerActionForm>
      <div className="rounded-xl border border-slate-200 bg-white p-3" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent feedback status</p>
        {recentFeedback.length ? (
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            {recentFeedback.map((feedback) => (
              <li key={feedback.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{feedback.reference}</span>
                <span>{FEEDBACK_LABELS[feedback.feedbackType]}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {statusLabel(feedback.status)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No feedback submitted for this {contractId ? "contract" : "workspace"} yet.</p>
        )}
      </div>
    </section>
  );
}

export function DeadlineCorrectnessFeedback({
  contractId,
  currentRoute,
  reviewStatus,
  deadlineWindow
}: {
  contractId: string;
  currentRoute: string;
  reviewStatus?: string | null;
  deadlineWindow?: string | null;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">Is this notice deadline correct?</h3>
        <p className="mt-1 text-sm text-slate-600">
          Your answer helps founder/support spot extraction problems without changing trusted metadata.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ServerActionForm serverAction={submitCustomerFeedbackFormAction}>
          <input type="hidden" name="contract_id" value={contractId} />
          <input type="hidden" name="entity_type" value="contract_metadata" />
          <input type="hidden" name="entity_id" value={contractId} />
          <input type="hidden" name="current_route" value={currentRoute} />
          <input type="hidden" name="field_name" value="notice_deadline_date" />
          <input type="hidden" name="review_status" value={reviewStatus ?? ""} />
          <input type="hidden" name="deadline_window" value={deadlineWindow ?? ""} />
          <input type="hidden" name="source_surface" value="contract_detail_deadline_check" />
          <input type="hidden" name="feedback_type" value="deadline_correct" />
          <input type="hidden" name="severity" value="low" />
          <Button type="submit" variant="secondary">
            Yes, correct
          </Button>
        </ServerActionForm>
        <details className="rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">No, report issue</summary>
          <ServerActionForm serverAction={submitCustomerFeedbackFormAction} className="mt-3 space-y-3">
            <input type="hidden" name="contract_id" value={contractId} />
            <input type="hidden" name="entity_type" value="contract_metadata" />
            <input type="hidden" name="entity_id" value={contractId} />
            <input type="hidden" name="current_route" value={currentRoute} />
            <input type="hidden" name="field_name" value="notice_deadline_date" />
            <input type="hidden" name="review_status" value={reviewStatus ?? ""} />
            <input type="hidden" name="deadline_window" value={deadlineWindow ?? ""} />
            <input type="hidden" name="source_surface" value="contract_detail_deadline_check" />
            <input type="hidden" name="feedback_type" value="deadline_incorrect" />
            <input type="hidden" name="severity" value="high" />
            <Textarea
              name="message"
              maxLength={1000}
              placeholder="What should founder/support check?"
              className="min-h-20"
            />
            <Button type="submit" variant="secondary">
              Submit issue
            </Button>
          </ServerActionForm>
        </details>
      </div>
    </section>
  );
}
