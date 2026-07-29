import {
  approveNegotiationBriefFormAction,
  approveVendorCommunicationDraftForCopyFormAction,
  archiveNegotiationBriefFormAction,
  archiveVendorCommunicationDraftFormAction,
  createNegotiationBriefFormAction,
  createNegotiationPlaybookItemFormAction,
  createVendorCommunicationDraftFormAction,
  recomputeNegotiationBriefFormAction,
  regenerateVendorCommunicationDraftFormAction,
  rejectNegotiationBriefFormAction,
  rejectVendorCommunicationDraftFormAction,
  submitNegotiationBriefFormAction,
  submitVendorCommunicationDraftFormAction
} from "@/lib/actions/negotiation-workflow";
import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";
import type {
  NegotiationBrief,
  NegotiationBriefEvidenceLink,
  NegotiationPlaybookItem,
  VendorCommunicationApprovalStep,
  VendorCommunicationDraft
} from "@/lib/negotiation-workflow/negotiation-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

const NEGOTIATION_ACTIONS = ["renegotiate", "escalate", "cancel", "needs_review"];

export function NegotiationWorkflowPanel({
  decision,
  brief,
  evidenceLinks,
  drafts,
  approvalSteps,
  playbookItems,
  approverOptions,
  currentUserId,
  canAct
}: {
  decision: CommercialDecision;
  brief: NegotiationBrief | null;
  evidenceLinks: NegotiationBriefEvidenceLink[];
  drafts: VendorCommunicationDraft[];
  approvalSteps: VendorCommunicationApprovalStep[];
  playbookItems: NegotiationPlaybookItem[];
  approverOptions: Array<{ userId: string; label: string }>;
  currentUserId: string;
  canAct: boolean;
}) {
  if (!NEGOTIATION_ACTIONS.includes(decision.recommended_action)) {
    return null;
  }
  const canApproveBrief = brief?.approver_user_id === currentUserId;
  const latestDraft = drafts[0] ?? null;
  const draftApprovalSteps = latestDraft
    ? approvalSteps.filter((step) => step.vendor_communication_draft_id === latestDraft.id)
    : [];
  const canApproveDraft = latestDraft?.approver_user_id === currentUserId;
  const briefReadyForDraft = brief && ["ready_for_review", "in_approval", "approved"].includes(brief.status);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">AI Negotiation Brief</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Draft-only vendor communication workflow</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Prepare an evidence-backed negotiation brief and internal vendor-message draft. This workflow never sends vendor communications.
          </p>
        </div>
        <Badge tone="automation">draft only</Badge>
      </div>

      {!brief ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-ink">No negotiation brief yet</p>
          <p className="mt-1 text-sm text-slate-600">Create a brief from the current commercial decision evidence.</p>
          {canAct ? (
            <ServerActionForm serverAction={createNegotiationBriefFormAction.bind(null, decision.id, decision.contract_id)} className="mt-3">
              <Button type="submit">Create negotiation brief</Button>
            </ServerActionForm>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone="automation">{brief.status.replaceAll("_", " ")}</Badge>
                <Badge tone="warning">{brief.strategy.replaceAll("_", " ")}</Badge>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-ink">{brief.executive_summary}</h3>
              <dl className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Target ask</dt>
                  <dd className="mt-1 text-sm text-slate-700">{brief.target_ask}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fallback</dt>
                  <dd className="mt-1 text-sm text-slate-700">{brief.fallback_position}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Savings argument</dt>
                  <dd className="mt-1 text-sm text-slate-700">{brief.savings_argument ?? "No savings argument yet."}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence confidence</dt>
                  <dd className="mt-1 text-sm text-slate-700">{Math.round(brief.confidence_score * 100)}%</dd>
                </div>
              </dl>
              {brief.review_flags.length || brief.blocker_codes.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {[...brief.blocker_codes, ...brief.review_flags].join(", ")}
                </div>
              ) : null}
            </div>

            {canAct ? (
              <div className="flex flex-wrap gap-2">
                {!["approved", "rejected", "archived"].includes(brief.status) ? (
                  <ServerActionForm serverAction={recomputeNegotiationBriefFormAction.bind(null, brief.id, decision.contract_id)}>
                    <Button type="submit" variant="secondary">Recompute brief</Button>
                  </ServerActionForm>
                ) : null}
                {["draft", "evidence_pending", "ready_for_review"].includes(brief.status) ? (
                  <ServerActionForm serverAction={submitNegotiationBriefFormAction.bind(null, brief.id, decision.contract_id)}>
                    <select name="approver_user_id" defaultValue={brief.approver_user_id ?? ""} className="mr-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <option value="">Choose approver</option>
                      {approverOptions.map((option) => (
                        <option key={option.userId} value={option.userId}>{option.label}</option>
                      ))}
                    </select>
                    <Button type="submit" variant="secondary">Submit brief</Button>
                  </ServerActionForm>
                ) : null}
                {brief.status === "in_approval" && canApproveBrief ? (
                  <>
                    <ServerActionForm serverAction={approveNegotiationBriefFormAction.bind(null, brief.id, decision.contract_id)}>
                      <Button type="submit">Approve brief</Button>
                    </ServerActionForm>
                    <ServerActionForm serverAction={rejectNegotiationBriefFormAction.bind(null, brief.id, decision.contract_id)}>
                      <Button type="submit" variant="danger">Reject brief</Button>
                    </ServerActionForm>
                  </>
                ) : null}
                {brief.status !== "archived" ? (
                  <ServerActionForm serverAction={archiveNegotiationBriefFormAction.bind(null, brief.id, decision.contract_id)}>
                    <Button type="submit" variant="ghost">Archive brief</Button>
                  </ServerActionForm>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-ink">Evidence links</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {evidenceLinks.length ? evidenceLinks.map((link) => (
                  <li key={link.id}>{link.evidence_label}</li>
                )) : <li>No evidence links attached yet.</li>}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <VendorDraftPanel
              decision={decision}
              brief={brief}
              draft={latestDraft}
              approvalSteps={draftApprovalSteps}
              canAct={canAct}
              canApproveDraft={canApproveDraft}
              canCreateDraft={Boolean(briefReadyForDraft)}
              approverOptions={approverOptions}
            />
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-ink">Playbook items</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {playbookItems.length ? playbookItems.map((item) => <li key={item.id}>{item.title}</li>) : <li>No playbook items yet.</li>}
              </ul>
              {canAct ? (
                <ServerActionForm serverAction={createNegotiationPlaybookItemFormAction.bind(null, decision.id, decision.contract_id)} className="mt-3 space-y-2">
                  <input type="hidden" name="negotiation_brief_id" value={brief.id} />
                  <input name="title" placeholder="Playbook item" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <textarea name="body" placeholder="Internal next step" className="min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <Button type="submit" variant="secondary">Add playbook item</Button>
                </ServerActionForm>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function VendorDraftPanel({
  decision,
  brief,
  draft,
  approvalSteps,
  canAct,
  canApproveDraft,
  canCreateDraft,
  approverOptions
}: {
  decision: CommercialDecision;
  brief: NegotiationBrief;
  draft: VendorCommunicationDraft | null;
  approvalSteps: VendorCommunicationApprovalStep[];
  canAct: boolean;
  canApproveDraft: boolean;
  canCreateDraft: boolean;
  approverOptions: Array<{ userId: string; label: string }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Vendor communication draft</p>
        <Badge tone="locked">no sending</Badge>
      </div>
      {!draft ? (
        <div className="mt-3 text-sm text-slate-600">
          {canCreateDraft ? "Create a draft-only message from the approved evidence." : "Brief must be review-ready before draft generation."}
          {canAct && canCreateDraft ? (
            <ServerActionForm serverAction={createVendorCommunicationDraftFormAction.bind(null, brief.id, decision.contract_id)} className="mt-3 flex flex-wrap gap-2">
              <select name="channel" defaultValue="email" className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="email">Email</option>
                <option value="internal_note">Internal note</option>
                <option value="call_script">Call script</option>
              </select>
              <select name="tone" defaultValue="neutral" className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="neutral">Neutral</option>
                <option value="firm">Firm</option>
                <option value="collaborative">Collaborative</option>
                <option value="executive">Executive</option>
              </select>
              <Button type="submit">Create draft</Button>
            </ServerActionForm>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone={draft.status === "approved_for_copy" ? "success" : "automation"}>{draft.status.replaceAll("_", " ")}</Badge>
            <Badge tone="warning">{draft.tone}</Badge>
          </div>
          {draft.subject ? <p className="text-sm font-semibold text-ink">{draft.subject}</p> : null}
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{draft.draft_body}</pre>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Approval timeline</p>
          <ul className="space-y-1 text-sm text-slate-600">
            {approvalSteps.length ? approvalSteps.map((step) => (
              <li key={step.id}>{step.status} {step.approver_user_id ? `by ${step.approver_user_id}` : ""}</li>
            )) : <li>No draft approval step yet.</li>}
          </ul>
          {canAct ? (
            <div className="flex flex-wrap gap-2">
              {!["approved_for_copy", "rejected", "archived"].includes(draft.status) ? (
                <ServerActionForm serverAction={regenerateVendorCommunicationDraftFormAction.bind(null, draft.id, decision.contract_id)}>
                  <input type="hidden" name="channel" value={draft.channel} />
                  <input type="hidden" name="tone" value={draft.tone} />
                  <Button type="submit" variant="secondary">Regenerate draft</Button>
                </ServerActionForm>
              ) : null}
              {["draft", "ready_for_review"].includes(draft.status) ? (
                <ServerActionForm serverAction={submitVendorCommunicationDraftFormAction.bind(null, draft.id, decision.contract_id)}>
                  <select name="approver_user_id" defaultValue={draft.approver_user_id ?? brief.approver_user_id ?? ""} className="mr-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="">Choose approver</option>
                    {approverOptions.map((option) => (
                      <option key={option.userId} value={option.userId}>{option.label}</option>
                    ))}
                  </select>
                  <Button type="submit" variant="secondary">Submit draft</Button>
                </ServerActionForm>
              ) : null}
              {draft.status === "in_approval" && canApproveDraft ? (
                <>
                  <ServerActionForm serverAction={approveVendorCommunicationDraftForCopyFormAction.bind(null, draft.id, decision.contract_id)}>
                    <Button type="submit">Approve for copy</Button>
                  </ServerActionForm>
                  <ServerActionForm serverAction={rejectVendorCommunicationDraftFormAction.bind(null, draft.id, decision.contract_id)}>
                    <Button type="submit" variant="danger">Reject draft</Button>
                  </ServerActionForm>
                </>
              ) : null}
              {draft.status !== "archived" ? (
                <ServerActionForm serverAction={archiveVendorCommunicationDraftFormAction.bind(null, draft.id, decision.contract_id)}>
                  <Button type="submit" variant="ghost">Archive draft</Button>
                </ServerActionForm>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
