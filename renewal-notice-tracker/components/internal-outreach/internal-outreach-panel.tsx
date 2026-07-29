import {
  approveOutreachDraftForCopyFormAction,
  archiveOutreachDraftFormAction,
  archiveOutreachOpportunityFormAction,
  createOutreachDraftFormAction,
  createOutreachPlaybookItemFormAction,
  createOutreachSuppressionFormAction,
  dismissDuplicateOutreachOpportunityFormAction,
  dismissOutreachOpportunityFormAction,
  refreshOutreachOpportunityIntelligenceFormAction,
  recomputeOutreachOpportunityFormAction,
  regenerateOutreachDraftFormAction,
  rejectOutreachDraftFormAction,
  submitOutreachDraftForApprovalFormAction
} from "@/lib/actions/internal-outreach-intelligence";
import type {
  InternalOutreachApprovalStep,
  InternalOutreachDraft,
  InternalOutreachEvidenceLink,
  InternalOutreachOpportunity,
  InternalOutreachPlaybookItem,
  InternalOutreachSuppression,
  OutreachAudienceResolution,
  OutreachCrmNote,
  OutreachPriorityScore,
  OutreachSafetyEvaluation,
  OutreachSequencePlan
} from "@/lib/internal-outreach-intelligence/outreach-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export type InternalOutreachDetail = {
  opportunity: InternalOutreachOpportunity;
  evidenceLinks: InternalOutreachEvidenceLink[];
  drafts: InternalOutreachDraft[];
  approvalSteps: InternalOutreachApprovalStep[];
  playbookItems: InternalOutreachPlaybookItem[];
  suppressions: InternalOutreachSuppression[];
  priorityScore: OutreachPriorityScore;
  audienceResolution: OutreachAudienceResolution;
  sequencePlan: OutreachSequencePlan;
  crmNote: OutreachCrmNote;
  safetyReview: OutreachSafetyEvaluation;
};

function badgeToneForPriority(priority: InternalOutreachOpportunity["priority"]) {
  if (priority === "critical") return "critical" as const;
  if (priority === "high") return "urgent" as const;
  if (priority === "medium") return "warning" as const;
  return "safe" as const;
}

function badgeToneForPriorityBand(priority: OutreachPriorityScore["priorityBand"]) {
  if (priority === "blocked" || priority === "critical") return "critical" as const;
  if (priority === "high") return "urgent" as const;
  if (priority === "medium") return "warning" as const;
  return "safe" as const;
}

function badgeToneForSafety(status: InternalOutreachOpportunity["safety_status"]) {
  if (status === "blocked") return "critical" as const;
  if (status === "needs_review") return "warning" as const;
  return "safe" as const;
}

export function InternalOutreachPanel({
  items,
  approverOptions,
  currentUserId,
  canAct,
  emptyMessage = "No internal outreach opportunities yet."
}: {
  items: InternalOutreachDetail[];
  approverOptions: Array<{ userId: string; label: string }>;
  currentUserId: string;
  canAct: boolean;
  emptyMessage?: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <p className="text-sm font-semibold text-ink">{emptyMessage}</p>
        <p className="mt-2 text-sm text-muted">
          Outreach intelligence is generated from existing renewal, commercial decision, quote, and negotiation evidence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <InternalOutreachCard
          key={item.opportunity.id}
          item={item}
          approverOptions={approverOptions}
          currentUserId={currentUserId}
          canAct={canAct}
        />
      ))}
    </div>
  );
}

function InternalOutreachCard({
  item,
  approverOptions,
  currentUserId,
  canAct
}: {
  item: InternalOutreachDetail;
  approverOptions: Array<{ userId: string; label: string }>;
  currentUserId: string;
  canAct: boolean;
}) {
  const { opportunity } = item;
  const latestDraft = item.drafts[0] ?? null;
  const contractId = opportunity.contract_id;
  const opportunityOpen = !["dismissed", "archived", "approved_for_copy"].includes(opportunity.status);
  const canCreateDraft =
    canAct &&
    !latestDraft &&
    opportunityOpen &&
    item.safetyReview.safetyStatus !== "blocked" &&
    item.sequencePlan.blockerCodes.length === 0 &&
    item.suppressions.length === 0;
  const canApproveDraft =
    canAct &&
    latestDraft?.status === "in_approval" &&
    latestDraft.safety_status !== "blocked" &&
    item.safetyReview.safetyStatus !== "blocked" &&
    item.sequencePlan.blockerCodes.length === 0 &&
    (!latestDraft.approver_user_id || latestDraft.approver_user_id === currentUserId);

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={badgeToneForPriority(opportunity.priority)}>{opportunity.priority}</Badge>
            <Badge tone="automation">{opportunity.opportunity_type.replaceAll("_", " ")}</Badge>
            <Badge tone={badgeToneForSafety(opportunity.safety_status)}>{opportunity.safety_status.replaceAll("_", " ")}</Badge>
            <Badge tone="locked">internal draft only</Badge>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-ink">{opportunity.reason_summary}</h2>
          <p className="mt-2 text-sm text-muted">
            Audience: {opportunity.audience.replaceAll("_", " ")} | Recommended channel:{" "}
            {opportunity.recommended_channel.replaceAll("_", " ")} | Evidence confidence:{" "}
            {Math.round(opportunity.evidence_confidence * 100)}%
          </p>
        </div>
        {contractId ? (
          <Button asChild variant="secondary">
            <a href={`/dashboard/contracts/${contractId}/internal-outreach`}>Open contract outreach</a>
          </Button>
        ) : null}
      </div>

      {opportunity.blocker_codes.length || opportunity.warning_codes.length || item.suppressions.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {[...opportunity.blocker_codes, ...opportunity.warning_codes, ...opportunity.safety_reasons].join(", ")}
          {item.suppressions.length ? " Active suppression blocks draft generation or approval." : ""}
        </div>
      ) : null}

      <GuidanceGrid item={item} />

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <EvidencePanel links={item.evidenceLinks} />
        <DraftPanel
          opportunity={opportunity}
          draft={latestDraft}
          approvalSteps={latestDraft ? item.approvalSteps.filter((step) => step.outreach_draft_id === latestDraft.id) : []}
          approverOptions={approverOptions}
          canAct={canAct}
          canCreateDraft={canCreateDraft}
          canApproveDraft={canApproveDraft}
        />
      </div>

      <SequenceAndCrmPanel item={item} />

      {canAct ? (
        <OpportunityActions opportunity={opportunity} contractId={contractId} opportunityOpen={opportunityOpen} />
      ) : null}

      {canAct ? <FollowUpForms opportunity={opportunity} contractId={contractId} /> : null}
    </article>
  );
}

function GuidanceGrid({ item }: { item: InternalOutreachDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Priority score</p>
          <Badge tone={badgeToneForPriorityBand(item.priorityScore.priorityBand)}>
            {item.priorityScore.priorityBand}
          </Badge>
        </div>
        <p className="mt-2 text-2xl font-semibold text-ink">{item.priorityScore.priorityScore}/100</p>
        <p className="mt-2 text-sm text-slate-600">{item.priorityScore.urgencyReason}</p>
        <p className="mt-1 text-xs text-muted">{item.priorityScore.nextBestAction}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-ink">Audience resolution</p>
        <p className="mt-2 text-sm text-slate-700">{item.audienceResolution.audienceLabel}</p>
        <p className="mt-1 text-xs text-muted">
          Role: {item.audienceResolution.audienceRole.replaceAll("_", " ")} | Confidence:{" "}
          {Math.round(item.audienceResolution.resolutionConfidence * 100)}%
        </p>
        {item.audienceResolution.blockerCodes.length ? (
          <p className="mt-2 text-xs font-semibold text-red-700">
            Blockers: {item.audienceResolution.blockerCodes.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-ink">Safety review</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={badgeToneForSafety(item.safetyReview.safetyStatus)}>
            {item.safetyReview.safetyStatus.replaceAll("_", " ")}
          </Badge>
          {item.safetyReview.safetyReasons.map((reason) => (
            <Badge key={reason} tone="warning">{reason.replaceAll("_", " ")}</Badge>
          ))}
        </div>
        {item.safetyReview.recommendedFix ? (
          <p className="mt-2 text-xs text-muted">{item.safetyReview.recommendedFix}</p>
        ) : null}
      </div>
    </div>
  );
}

function EvidencePanel({ links }: { links: InternalOutreachEvidenceLink[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-ink">Evidence</p>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {links.length ? links.map((link) => <li key={link.id}>{link.evidence_label}</li>) : <li>No evidence links attached yet.</li>}
      </ul>
    </div>
  );
}

function SequenceAndCrmPanel({ item }: { item: InternalOutreachDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-ink">Recommended sequence</p>
        <ol className="mt-2 space-y-2 text-sm text-slate-600">
          {item.sequencePlan.steps.map((step) => (
            <li key={`${item.opportunity.id}-${step.stepOrder}`} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
              <span className="font-semibold text-ink">{step.stepOrder}. {step.stepType.replaceAll("_", " ")}</span>
              <span className="block">{step.purpose}</span>
              {step.approvalRequired ? <span className="block text-xs text-amber-700">Approval required before manual copy.</span> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">CRM note preview</p>
          <Badge tone={item.crmNote.syncStatus === "blocked" ? "critical" : item.crmNote.syncStatus === "archived" ? "locked" : "automation"}>
            {item.crmNote.syncStatus.replaceAll("_", " ")}
          </Badge>
        </div>
        <p className="mt-2 text-sm font-semibold text-ink">{item.crmNote.crmNoteTitle}</p>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{item.crmNote.crmNoteBodyPreview}</pre>
        <p className="mt-2 text-xs text-muted">Prepared for manual CRM note copy only. No CRM connection or sync is performed.</p>
      </div>
    </div>
  );
}

function OpportunityActions({
  opportunity,
  contractId,
  opportunityOpen
}: {
  opportunity: InternalOutreachOpportunity;
  contractId: string | null;
  opportunityOpen: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opportunityOpen ? (
        <ServerActionForm serverAction={recomputeOutreachOpportunityFormAction.bind(null, opportunity.id, contractId)}>
          <Button type="submit" variant="secondary">Recompute</Button>
        </ServerActionForm>
      ) : null}
      {opportunityOpen ? (
        <ServerActionForm serverAction={refreshOutreachOpportunityIntelligenceFormAction.bind(null, opportunity.id, contractId)}>
          <Button type="submit" variant="secondary">Refresh guidance</Button>
        </ServerActionForm>
      ) : null}
      {opportunityOpen ? (
        <ServerActionForm serverAction={dismissOutreachOpportunityFormAction.bind(null, opportunity.id, contractId)}>
          <Button type="submit" variant="ghost">Dismiss</Button>
        </ServerActionForm>
      ) : null}
      {opportunityOpen ? (
        <ServerActionForm serverAction={dismissDuplicateOutreachOpportunityFormAction.bind(null, opportunity.id, contractId)}>
          <input type="hidden" name="duplicate_of_opportunity_id" value="" />
          <Button type="submit" variant="ghost">Dismiss duplicate</Button>
        </ServerActionForm>
      ) : null}
      {opportunity.status !== "archived" ? (
        <ServerActionForm serverAction={archiveOutreachOpportunityFormAction.bind(null, opportunity.id, contractId)}>
          <Button type="submit" variant="ghost">Archive</Button>
        </ServerActionForm>
      ) : null}
    </div>
  );
}

function FollowUpForms({
  opportunity,
  contractId
}: {
  opportunity: InternalOutreachOpportunity;
  contractId: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ServerActionForm serverAction={createOutreachPlaybookItemFormAction.bind(null, opportunity.id, contractId)} className="space-y-2 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-ink">Internal playbook item</p>
        <input name="title" placeholder="Follow-up title" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <textarea name="body" placeholder="Internal next step" className="min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <Button type="submit" variant="secondary">Add playbook item</Button>
      </ServerActionForm>
      <ServerActionForm serverAction={createOutreachSuppressionFormAction.bind(null, opportunity.id, contractId)} className="space-y-2 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-ink">Suppression</p>
        <input type="hidden" name="audience" value={opportunity.audience} />
        <input name="reason_code" placeholder="Reason code" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input name="expires_at" placeholder="Optional expiry ISO date" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <Button type="submit" variant="secondary">Suppress outreach</Button>
      </ServerActionForm>
    </div>
  );
}

function DraftPanel({
  opportunity,
  draft,
  approvalSteps,
  approverOptions,
  canAct,
  canCreateDraft,
  canApproveDraft
}: {
  opportunity: InternalOutreachOpportunity;
  draft: InternalOutreachDraft | null;
  approvalSteps: InternalOutreachApprovalStep[];
  approverOptions: Array<{ userId: string; label: string }>;
  canAct: boolean;
  canCreateDraft: boolean;
  canApproveDraft: boolean;
}) {
  if (!draft) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Internal outreach draft</p>
          <Badge tone="locked">no sending</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Create a draft for manual review and copy only. The system will not send or deliver external messages.
        </p>
        {canCreateDraft ? (
          <ServerActionForm serverAction={createOutreachDraftFormAction.bind(null, opportunity.id, opportunity.contract_id)} className="mt-3 flex flex-wrap gap-2">
            <select name="channel" defaultValue={opportunity.recommended_channel} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="internal_email">Internal email</option>
              <option value="internal_note">Internal note</option>
              <option value="call_script">Call script</option>
              <option value="meeting_agenda">Meeting agenda</option>
              <option value="crm_note">CRM note draft</option>
            </select>
            <select name="tone" defaultValue="concise" className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="concise">Concise</option>
              <option value="executive">Executive</option>
              <option value="collaborative">Collaborative</option>
              <option value="firm">Firm</option>
              <option value="procurement">Procurement</option>
              <option value="legal">Legal</option>
              <option value="customer_success">Customer success</option>
            </select>
            <Button type="submit">Create draft</Button>
          </ServerActionForm>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Internal outreach draft</p>
        <Badge tone="locked">manual copy only</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={draft.status === "approved_for_copy" ? "success" : "automation"}>{draft.status.replaceAll("_", " ")}</Badge>
        <Badge tone={badgeToneForSafety(draft.safety_status)}>{draft.safety_status.replaceAll("_", " ")}</Badge>
        <Badge tone="warning">{draft.tone}</Badge>
      </div>
      <p className="text-sm font-semibold text-ink">{draft.subject_or_heading ?? draft.title}</p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{draft.body_preview}</pre>
      <p className="text-xs text-muted">Approval means the text can be manually copied. It does not send, sync, or deliver anything.</p>
      <ul className="space-y-1 text-sm text-slate-600">
        {approvalSteps.length ? (
          approvalSteps.map((step) => <li key={step.id}>{step.status} {step.approver_user_id ? `by ${step.approver_user_id}` : ""}</li>)
        ) : (
          <li>No approval step yet.</li>
        )}
      </ul>
      {canAct ? (
        <div className="flex flex-wrap gap-2">
          {!["approved_for_copy", "archived"].includes(draft.status) ? (
            <ServerActionForm serverAction={regenerateOutreachDraftFormAction.bind(null, draft.id, opportunity.contract_id)}>
              <input type="hidden" name="channel" value={draft.channel} />
              <input type="hidden" name="tone" value={draft.tone} />
              <Button type="submit" variant="secondary">Regenerate draft</Button>
            </ServerActionForm>
          ) : null}
          {["draft", "ready_for_review"].includes(draft.status) ? (
            <ServerActionForm serverAction={submitOutreachDraftForApprovalFormAction.bind(null, draft.id, opportunity.contract_id)}>
              <select name="approver_user_id" defaultValue={draft.approver_user_id ?? opportunity.approver_user_id ?? ""} className="mr-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">Choose approver</option>
                {approverOptions.map((option) => (
                  <option key={option.userId} value={option.userId}>{option.label}</option>
                ))}
              </select>
              <Button type="submit" variant="secondary">Submit for approval</Button>
            </ServerActionForm>
          ) : null}
          {canApproveDraft ? (
            <>
              <ServerActionForm serverAction={approveOutreachDraftForCopyFormAction.bind(null, draft.id, opportunity.contract_id)}>
                <Button type="submit">Approve for copy</Button>
              </ServerActionForm>
              <ServerActionForm serverAction={rejectOutreachDraftFormAction.bind(null, draft.id, opportunity.contract_id)}>
                <Button type="submit" variant="danger">Reject draft</Button>
              </ServerActionForm>
            </>
          ) : null}
          {draft.status !== "archived" ? (
            <ServerActionForm serverAction={archiveOutreachDraftFormAction.bind(null, draft.id, opportunity.contract_id)}>
              <Button type="submit" variant="ghost">Archive draft</Button>
            </ServerActionForm>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
