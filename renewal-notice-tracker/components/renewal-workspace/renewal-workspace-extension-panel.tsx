import {
  confirmRenewalOutcomeFormAction,
  createRenewalScenarioFormAction,
  createRenewalTaskFormAction,
  selectPreferredRenewalScenarioFormAction,
  transitionRenewalTaskFormAction,
  updateRenewalDecisionProfileFormAction
} from "@/lib/actions/renewal-workspace";
import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";
import {
  RENEWAL_DECISION_TYPES,
  RENEWAL_SCENARIO_TYPES,
  RENEWAL_TASK_PRIORITIES,
  RENEWAL_TASK_STATUSES,
  type RenewalWorkspaceExtension
} from "@/lib/renewal-workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink";
const labelClass = "space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600";

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: number | null, currency: string | null) {
  if (value === null) return "Not provided";
  return `${currency ?? ""} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
}

export function RenewalWorkspaceExtensionPanel({
  contractId,
  decision,
  extension,
  members,
  canAct
}: {
  contractId: string;
  decision: CommercialDecision;
  extension: RenewalWorkspaceExtension;
  members: Array<{ userId: string; label: string }>;
  canAct: boolean;
}) {
  const canConfirmOutcome = ["approved", "finalized", "decision_recorded"].includes(decision.decision_status);

  return (
    <section className="space-y-5" aria-label="Renewal decision and negotiation workspace">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Decision record</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Evidence-backed renewal direction</h2>
            <p className="mt-1 text-sm text-slate-600">
              Material edits create a new decision version and require approval again.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge tone="locked">Version {decision.decision_version ?? 1}</Badge>
            <Badge tone={decision.approved_version === decision.decision_version ? "success" : "warning"}>
              {decision.approved_version === decision.decision_version ? "Current version approved" : "Approval required"}
            </Badge>
          </div>
        </div>

        {canAct ? (
          <form
            action={updateRenewalDecisionProfileFormAction.bind(null, decision.id, contractId)}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <label className={labelClass}>
              Decision type
              <select name="decision_type" className={inputClass} defaultValue={decision.decision_type ?? "insufficient_information"}>
                {RENEWAL_DECISION_TYPES.map((value) => <option key={value} value={value}>{title(value)}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              Decision owner
              <select name="decision_owner_user_id" className={inputClass} defaultValue={decision.decision_owner_user_id ?? decision.owner_user_id ?? ""} required>
                <option value="" disabled>Select an organization member</option>
                {members.map((member) => <option key={member.userId} value={member.userId}>{member.label}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              Decision deadline
              <input name="decision_deadline" type="date" className={inputClass} defaultValue={decision.decision_deadline ?? decision.notice_deadline ?? ""} required />
            </label>
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <label className={labelClass}>
                Estimated financial effect
                <input name="estimated_financial_effect" type="number" min="0" step="0.01" className={inputClass} defaultValue={decision.estimated_financial_effect ?? ""} />
              </label>
              <label className={labelClass}>
                Currency
                <input name="currency" pattern="[A-Za-z]{3}" maxLength={3} className={inputClass} defaultValue={decision.currency ?? ""} />
              </label>
            </div>
            <label className={`${labelClass} md:col-span-2`}>
              Rationale
              <textarea name="rationale" className={`${inputClass} min-h-24 normal-case tracking-normal`} maxLength={4000} defaultValue={decision.rationale ?? ""} required />
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Save decision profile</Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-600">You can review this record, but your role cannot change renewal decisions.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scenario comparison</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Commercial options</h2>
          </div>
          <p className="text-xs text-slate-500">Currencies are never combined without a named exchange-rate source.</p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {extension.scenarios.map((scenario) => (
            <article key={scenario.id} className={`rounded-xl border p-4 ${scenario.is_preferred ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title(scenario.scenario_type)}</p>
                  <h3 className="mt-1 font-semibold text-ink">{scenario.name}</h3>
                </div>
                {scenario.is_preferred ? <Badge tone="automation">Preferred</Badge> : null}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500">Annual cost</dt><dd className="font-semibold text-ink">{money(scenario.annual_cost, scenario.currency)}</dd></div>
                <div><dt className="text-slate-500">Estimated savings</dt><dd className="font-semibold text-ink">{money(scenario.estimated_savings, scenario.currency)}</dd></div>
                <div><dt className="text-slate-500">First-year effect</dt><dd className="font-semibold text-ink">{money(scenario.net_first_year_effect, scenario.currency)}</dd></div>
                <div><dt className="text-slate-500">Evidence</dt><dd className="font-semibold text-ink">{Math.round(scenario.evidence_completeness * 100)}%</dd></div>
              </dl>
              {canAct && !scenario.is_preferred ? (
                <form action={selectPreferredRenewalScenarioFormAction.bind(null, decision.id, contractId, scenario.id)} className="mt-4">
                  <Button type="submit" variant="secondary">Select scenario</Button>
                </form>
              ) : null}
            </article>
          ))}
          {!extension.scenarios.length ? <p className="text-sm text-slate-600">No scenarios have been recorded.</p> : null}
        </div>

        {canAct ? (
          <form action={createRenewalScenarioFormAction.bind(null, decision.id, contractId)} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-3">
            <label className={labelClass}>Scenario type<select name="scenario_type" className={inputClass}>{RENEWAL_SCENARIO_TYPES.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
            <label className={labelClass}>Scenario name<input name="name" className={inputClass} maxLength={160} required /></label>
            <label className={labelClass}>Annual cost<input name="annual_cost" type="number" min="0" step="0.01" className={inputClass} required /></label>
            <label className={labelClass}>Current annual cost<input name="current_annual_cost" type="number" min="0" step="0.01" className={inputClass} /></label>
            <label className={labelClass}>Currency<input name="currency" pattern="[A-Za-z]{3}" maxLength={3} className={inputClass} defaultValue={decision.currency ?? "USD"} required /></label>
            <label className={labelClass}>Current currency<input name="current_currency" pattern="[A-Za-z]{3}" maxLength={3} className={inputClass} defaultValue={decision.currency ?? "USD"} /></label>
            <label className={labelClass}>Transition cost<input name="one_time_transition_cost" type="number" min="0" step="0.01" className={inputClass} /></label>
            <label className={labelClass}>Commitment years<input name="commitment_years" type="number" min="1" max="10" step="1" className={inputClass} defaultValue="1" /></label>
            <label className={labelClass}>Exchange rate<input name="exchange_rate" type="number" min="0" step="0.000001" className={inputClass} /></label>
            <label className={`${labelClass} md:col-span-2`}>Exchange-rate source<input name="exchange_rate_source" className={inputClass} maxLength={200} placeholder="Required only when currencies differ" /></label>
            <div className="self-end"><Button type="submit">Add scenario</Button></div>
          </form>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Action plan</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Internal renewal tasks</h2>
          <div className="mt-4 space-y-3">
            {extension.tasks.map((task) => (
              <article key={task.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold text-ink">{task.title}</p><p className="mt-1 text-xs text-slate-500">Due {formatDate(task.due_at)} · {title(task.priority)}</p></div>
                  <Badge tone={task.status === "completed" ? "success" : task.status === "blocked" ? "critical" : "warning"}>{title(task.status)}</Badge>
                </div>
                {canAct && task.status !== "completed" && task.status !== "cancelled" ? (
                  <form action={transitionRenewalTaskFormAction.bind(null, decision.id, contractId, task.id)} className="mt-3 flex gap-2">
                    <select name="status" className={inputClass} defaultValue={task.status}>{RENEWAL_TASK_STATUSES.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select>
                    <Button type="submit" variant="secondary">Update</Button>
                  </form>
                ) : null}
              </article>
            ))}
            {!extension.tasks.length ? <p className="text-sm text-slate-600">No internal tasks have been added.</p> : null}
          </div>
          {canAct ? (
            <form action={createRenewalTaskFormAction.bind(null, decision.id, contractId)} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-2">
              <label className={`${labelClass} md:col-span-2`}>Task title<input name="title" className={inputClass} maxLength={200} required /></label>
              <label className={labelClass}>Owner<select name="owner_user_id" className={inputClass}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.label}</option>)}</select></label>
              <label className={labelClass}>Due at<input name="due_at" type="datetime-local" className={inputClass} /></label>
              <label className={labelClass}>Priority<select name="priority" className={inputClass}>{RENEWAL_TASK_PRIORITIES.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
              <label className={labelClass}>Depends on<select name="dependency_task_id" className={inputClass}><option value="">No dependency</option>{extension.tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
              <label className={`${labelClass} md:col-span-2`}>Evidence required<input name="evidence_requirement" className={inputClass} maxLength={500} /></label>
              <div className="md:col-span-2"><Button type="submit">Add internal task</Button></div>
            </form>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirmed value</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Renewal outcome</h2>
          {extension.outcome ? (
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-slate-500">Decision</dt><dd className="font-semibold text-ink">{title(extension.outcome.selected_decision_type)}</dd></div>
              <div><dt className="text-slate-500">Completed</dt><dd className="font-semibold text-ink">{formatDate(extension.outcome.renewal_completed_at)}</dd></div>
              <div><dt className="text-slate-500">Estimated savings</dt><dd className="font-semibold text-ink">{money(extension.outcome.estimated_savings, extension.outcome.currency)}</dd></div>
              <div><dt className="text-slate-500">Realized savings</dt><dd className="font-semibold text-ink">{money(extension.outcome.realized_savings, extension.outcome.currency)}</dd></div>
            </dl>
          ) : canAct && canConfirmOutcome ? (
            <form action={confirmRenewalOutcomeFormAction.bind(null, decision.id, contractId)} className="mt-4 grid gap-3 md:grid-cols-2">
              <label className={labelClass}>Original cost<input name="original_cost" type="number" min="0" step="0.01" className={inputClass} /></label>
              <label className={labelClass}>Final agreed cost<input name="final_agreed_cost" type="number" min="0" step="0.01" className={inputClass} /></label>
              <label className={labelClass}>Seats before<input name="seats_before" type="number" min="0" step="1" className={inputClass} /></label>
              <label className={labelClass}>Seats after<input name="seats_after" type="number" min="0" step="1" className={inputClass} /></label>
              <label className={labelClass}>Contract term (months)<input name="contract_term_months" type="number" min="1" max="240" step="1" className={inputClass} /></label>
              <label className={labelClass}>Currency<input name="currency" pattern="[A-Za-z]{3}" maxLength={3} className={inputClass} defaultValue={decision.currency ?? ""} /></label>
              <label className={labelClass}>Estimated savings<input name="estimated_savings" type="number" min="0" step="0.01" className={inputClass} /></label>
              <label className={labelClass}>Realized savings<input name="realized_savings" type="number" min="0" step="0.01" className={inputClass} /></label>
              <label className={labelClass}>Avoided cost increase<input name="avoided_cost_increase" type="number" min="0" step="0.01" className={inputClass} /></label>
              <label className={labelClass}>Decision date<input name="decision_date" type="date" className={inputClass} required /></label>
              <label className={labelClass}>Renewal completed<input name="renewal_completed_at" type="date" className={inputClass} required /></label>
              <div className="md:col-span-2"><Button type="submit">Confirm customer outcome</Button></div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-slate-600">Approve the current decision version before recording a confirmed outcome.</p>
          )}
          <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Estimated savings and realized savings remain separate. Only customer-confirmed outcomes count as realized value.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Vendor communications remain editable, unverified drafts. NoticeControl never sends, cancels, purchases, or changes licenses from this workspace.
      </div>
    </section>
  );
}
