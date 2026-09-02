import { notFound } from "next/navigation";
import { hasRequiredRole, requireOrganization } from "@/lib/auth";
import {
  getContractById,
  getContractPendingRenewalActionRequestCount,
  getContractRenewalActionRequests,
  getCounterparties,
  getOrganizationTimezone,
  getOrganizationMembers
} from "@/lib/contracts/kernel-queries";
import {
  assignContractOwnerAction,
  completeRenewalActionRequestAction,
  dismissRenewalActionRequestAction,
  recordSampleContractOpened,
  requestRenewalActionAction
} from "@/lib/actions/contracts";
import { removeSampleContractAction } from "@/lib/actions/contracts/sample";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewForm } from "@/components/contracts/review-form";
import { ReminderTimeline } from "@/components/contracts/reminder-timeline";
import { NoteForm } from "@/components/contracts/note-form";
import { RenewalDecisionForm } from "@/components/contracts/renewal-decision-form";
import { ContractCycleActions } from "@/components/contracts/contract-cycle-actions";
import { ContractWorkflowSummary } from "@/components/contracts/contract-workflow-summary";
import { ContractActivityFeed } from "@/components/contracts/contract-activity-feed";
import { ContractEnterpriseAuditTimeline } from "@/components/contracts/contract-enterprise-audit-timeline";
import { ContractSecondaryTabs } from "@/components/contracts/contract-secondary-tabs";
import { ContractDetailShell } from "@/components/contracts/contract-detail-shell";
import { getRiskConfidenceLabel } from "@/lib/intelligence/risk/dashboard";
import { RiskExplanationDrawer } from "@/components/contracts/risk-explanation-drawer";
import { RiskBadge } from "@/components/contracts/risk-badge";
import { ReadinessScoreCard } from "@/components/contracts/readiness-score-card";
import { TrustedReminderBlockers } from "@/components/contracts/trusted-reminder-blockers";
import { ContractOnboardingPanel } from "@/components/contracts/contract-onboarding-panel";
import { ContractExtractionReviewPanel } from "@/components/contracts/contract-extraction-review-panel";
import { RenewalQuoteComparisonPanel } from "@/components/contracts/renewal-quote-comparison-panel";
import { DecisionLoopLedger } from "@/components/contracts/decision-loop-ledger";
import { ManualRenewalTemplatePanel } from "@/components/contracts/manual-renewal-template-panel";
import {
  CustomerFeedbackPanel,
  DeadlineCorrectnessFeedback
} from "@/components/customer-feedback/customer-feedback-panel";
import {
  auditRiskBadgeViewed
} from "@/lib/intelligence/audit";
import { formatDate } from "@/lib/utils";
import { buildContractDetailViewModel } from "@/lib/contracts/contract-detail-view";
import { getContractAuditTimeline } from "@/lib/enterprise-audit/audit-queries";
import {
  listContractDocumentRelationships,
  listContractExtractedFields,
  listContractExtractionRuns
} from "@/lib/contract-intelligence/extraction-runs";
import {
  listQuoteComparisons,
  listQuoteFindings,
  listSavingsOpportunities
} from "@/lib/quote-comparison/quote-comparison";
import { getSaasOptOutStatusForContract } from "@/lib/saas/queries";
import { SaasClockActivationPanel } from "@/components/contracts/saas-clock-activation-panel";
import { evaluateSaasContractActivationReadiness } from "@/lib/saas/contract-activation";

export default async function ContractDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireOrganization();
  const { organizationId } = context;
  const [contract, members, counterparties, organizationTimezone] = await Promise.all([
    getContractById(id, organizationId).catch(() => null),
    getOrganizationMembers(organizationId),
    getCounterparties(organizationId),
    getOrganizationTimezone(organizationId)
  ]);

  if (!contract || !contract.contract_metadata) notFound();

  const [
    viewModel,
    enterpriseAuditTimeline,
    extractionRuns,
    extractedFields,
    documentRelationships,
    quoteComparisons,
    quoteFindings,
    savingsOpportunities,
    saasOptOutStatus,
    renewalActionRequests,
    pendingRenewalActionRequestCount
  ] = await Promise.all([
    buildContractDetailViewModel({
      context,
      contract,
      members,
      counterparties
    }),
    getContractAuditTimeline({
      organizationId,
      contractId: contract.id,
      limit: 12
    }),
    listContractExtractionRuns({
      organizationId,
      contractId: contract.id,
      limit: 5
    }),
    listContractExtractedFields({
      organizationId,
      contractId: contract.id
    }),
    listContractDocumentRelationships({
      organizationId,
      contractId: contract.id
    }),
    listQuoteComparisons({
      organizationId,
      contractId: contract.id,
      limit: 5
    }),
    listQuoteFindings({
      organizationId,
      contractId: contract.id,
      limit: 25
    }),
    listSavingsOpportunities({
      organizationId,
      contractId: contract.id,
      limit: 25
    }),
    getSaasOptOutStatusForContract(organizationId, contract.id),
    getContractRenewalActionRequests(organizationId, contract.id, { limit: 8 }),
    getContractPendingRenewalActionRequestCount(organizationId, contract.id)
  ]);
  const canReviewExtraction = hasRequiredRole(context.role, ["admin", "operator", "reviewer"]);
  const canManageOwner = hasRequiredRole(context.role, ["owner", "admin", "operator"]);
  const canManageSample = hasRequiredRole(context.role, ["admin", "operator"]);
  const defaultOwnerUserId =
    contract.owner_user_id ??
    (viewModel.memberLabels.some((member) => member.user_id === context.user.id) ? context.user.id : "");
  const pendingRequestForCurrentUser = renewalActionRequests.find(
    (request) => request.request_status === "pending" && request.requested_to_user_id === context.user.id
  );
  const pendingRequestCount = pendingRenewalActionRequestCount;
  const riskBadgeAccess = viewModel.intelligenceAccess.accessBySurface.risk_badge;
  const riskExplanationAccess = viewModel.intelligenceAccess.accessBySurface.risk_explanation;
  const activationMetadata = Array.isArray(contract.contract_metadata)
    ? contract.contract_metadata[0]
    : contract.contract_metadata;
  const saasActivationReadiness = evaluateSaasContractActivationReadiness({
    needsReview: activationMetadata?.needs_review ?? true,
    reviewedAt: activationMetadata?.reviewed_at ?? null,
    reviewedBy: activationMetadata?.reviewed_by ?? null,
    noticeDeadlineDate: activationMetadata?.notice_deadline_date ?? null,
    deadlineVerifiedAt: activationMetadata?.deadline_verified_at ?? null,
    autoRenewal: activationMetadata?.auto_renewal ?? null,
    contractTitle: activationMetadata?.contract_title ?? null,
    counterpartyName: activationMetadata?.counterparty_name ?? null,
    ownerUserId: contract.owner_user_id,
    contractValueAmount: activationMetadata?.contract_value_amount ?? null,
    contractValueCurrency: activationMetadata?.contract_value_currency ?? null
  });
  if (riskBadgeAccess.allowed) {
    await auditRiskBadgeViewed({
      organizationId,
      actorUserId: context.user.id,
      contractId: contract.id,
      riskBand: viewModel.riskExplanation.riskBand,
      lowConfidenceCount: viewModel.riskExplanation.confidenceLevel === "low" ? 1 : 0,
      calculationVersion: viewModel.riskExplanation.explanationMetadata.calculation_version,
      explanationAvailable: riskExplanationAccess.allowed
    });
  }
  if (contract.is_sample) {
    await recordSampleContractOpened(contract.id).catch(() => undefined);
  }

  return (
    <ContractDetailShell
      title={viewModel.title}
      subtitle={`${viewModel.counterpartyName} | Updated ${formatDate(contract.updated_at)}`}
      supportingLine={
        contract.is_sample
          ? "This is fictional sample data for onboarding. Use it to explore the workflow, then remove it before relying on real deadlines."
          : "Run the contract through review, owner assignment, reminders, acknowledgment, decision, and closure from one calm workflow."
      }
      primaryAction={
        <>
          <Button asChild>
            <a href={`/dashboard/contracts/${contract.id}/commercial-decision`}>Open decision workbench</a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/dashboard/contracts/${contract.id}/internal-outreach`}>Open outreach drafts</a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/dashboard/contracts/${contract.id}/ics`}>Download calendar event</a>
          </Button>
        </>
      }
      badges={
        <>
          <Badge tone={viewModel.reviewBlocked ? "warning" : "success"}>
            {viewModel.reviewBlocked ? "Needs review" : "Reviewed"}
          </Badge>
          <Badge>{viewModel.trustState}</Badge>
          {riskBadgeAccess.allowed ? (
            riskExplanationAccess.allowed ? (
              <>
                <RiskExplanationDrawer
                  explanation={viewModel.riskExplanation}
                  auditSurface="contract_detail"
                />
                <Badge tone={viewModel.riskExplanation.confidenceLevel === "low" ? "warning" : "default"}>
                  {getRiskConfidenceLabel(viewModel.riskExplanation.confidenceLevel)}
                </Badge>
              </>
            ) : (
              <RiskBadge riskBand={viewModel.riskExplanation.riskBand} />
            )
          ) : null}
          {viewModel.ocrAssisted ? <Badge tone="warning">OCR-assisted</Badge> : null}
          {viewModel.metadata.auto_renewal ? <Badge>Auto-renewal</Badge> : null}
          {contract.is_sample ? <Badge tone="warning">Sample data</Badge> : null}
        </>
      }
      statusStrip={
        <ContractWorkflowSummary
          nextAction={viewModel.nextAction}
          items={viewModel.workflowItems}
        />
      }
      reviewPanel={
        <div className="space-y-6">
          {contract.is_sample ? (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <Badge tone="warning">Fictional sample contract</Badge>
                  <h2 className="mt-3 text-lg font-semibold text-ink">Explore, then replace with real data</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">
                    These vendor, date, value, and evidence fields are synthetic. NoticeControl has not sent
                    reminders or vendor notices for this sample.
                  </p>
                </div>
                {canManageSample ? (
                  <form action={removeSampleContractAction.bind(null, contract.id)} className="rounded-xl bg-white p-3 text-left shadow-sm">
                    <label className="flex max-w-sm items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        name="confirm_sample_removal"
                        value="yes"
                        required
                        className="mt-0.5 rounded border-slate-300"
                      />
                      Remove only this fictional sample contract. Real contracts are never removed from this
                      sample action.
                    </label>
                    <Button type="submit" variant="secondary" className="mt-3">
                      Remove sample
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ) : null}
          <div id="contract-review">
            <ReviewForm
              contractId={contract.id}
              metadata={viewModel.reviewMetadata as never}
              members={viewModel.memberLabels}
            />
          </div>
          <CustomerFeedbackPanel
            title="Deadline or metadata looks wrong?"
            description="Tell founder/support what looks off. This does not change trusted dates; it creates a safe help request."
            defaultFeedbackType={viewModel.metadata.notice_deadline_date ? "deadline_incorrect" : "extraction_problem"}
            contractId={contract.id}
            entityType="contract_metadata"
            entityId={contract.id}
            currentRoute={`/dashboard/contracts/${contract.id}`}
            reviewStatus={viewModel.reviewBlocked ? "needs_review" : "reviewed"}
            decisionStatus={contract.renewal_decision_status}
            sourceSurface="contract_detail_metadata"
          />
          {viewModel.metadata.notice_deadline_date ? (
            <DeadlineCorrectnessFeedback
              contractId={contract.id}
              currentRoute={`/dashboard/contracts/${contract.id}`}
              reviewStatus={viewModel.reviewBlocked ? "needs_review" : "reviewed"}
            />
          ) : null}
        </div>
      }
      ownerReminderPanel={
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-3">
            <ReadinessScoreCard score={viewModel.readinessScore} />
            <TrustedReminderBlockers
              gate={viewModel.trustedReminderGate}
              approvalState={viewModel.trustExceptionApprovalState}
            />
            <DecisionLoopLedger loop={viewModel.decisionLoop} />
          </div>
          <ContractOnboardingPanel
            contractId={contract.id}
            readinessScore={viewModel.readinessScore}
            trustedReminderGate={viewModel.trustedReminderGate}
            approvalState={viewModel.trustExceptionApprovalState}
          />
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div id="owner-panel" className="panel p-6">
              <h2 className="text-lg font-semibold">Owner and reminder readiness</h2>
              <div className="mt-4 space-y-4">
                <div id="reminders" className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Current owner
                  </p>
                  <p className="mt-2 text-base font-semibold text-ink">{viewModel.ownerReadiness.ownerStatus}</p>
                  <p className="mt-2 text-sm text-slate-600">{viewModel.ownerReadiness.ownerHelp}</p>
                </div>
                {canManageOwner ? (
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Owner assignment
                    </p>
                    <form action={assignContractOwnerAction.bind(null, contract.id)} className="mt-3 space-y-3">
                      <input type="hidden" name="action_source" value="contract_detail" />
                      <label className="block text-sm font-medium text-slate-700" htmlFor="owner_user_id">
                        Accountable owner
                      </label>
                      <select
                        id="owner_user_id"
                        name="owner_user_id"
                        defaultValue={defaultOwnerUserId}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {viewModel.memberLabels.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.label}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="secondary">
                        Save owner
                      </Button>
                    </form>
                  </div>
                ) : null}
                {canManageOwner ? (
                  <div className="rounded-2xl border border-brand-100 bg-brand-50/30 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={pendingRequestCount > 0 ? "urgent" : "default"}>
                        {pendingRequestCount} pending
                      </Badge>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Request owner action
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Ask the assigned internal owner to decide whether to renew, cancel, renegotiate, or defer.
                      NoticeControl will not send anything to the vendor.
                    </p>
                    <form action={requestRenewalActionAction.bind(null, contract.id)} className="mt-3 space-y-3">
                      <label className="block text-sm font-medium text-slate-700" htmlFor="due_date">
                        Due date
                      </label>
                      <input
                        id="due_date"
                        name="due_date"
                        type="date"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <label className="block text-sm font-medium text-slate-700" htmlFor="message">
                        Internal note, optional
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        maxLength={500}
                        rows={3}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Keep this internal and under 500 characters."
                      />
                      <Button type="submit" disabled={!contract.owner_user_id}>
                        Request decision
                      </Button>
                    </form>
                  </div>
                ) : null}
                {pendingRequestForCurrentUser ? (
                  <div className="rounded-2xl border border-urgent/20 bg-urgent/5 p-4">
                    <Badge tone="urgent">Action requested</Badge>
                    <h3 className="mt-3 text-base font-semibold text-ink">Your renewal decision is requested</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Complete this internal request after reviewing the trusted dates and evidence. This does not send
                      a notice or contact the vendor.
                    </p>
                    {pendingRequestForCurrentUser.message ? (
                      <p className="mt-2 rounded-xl bg-white p-3 text-sm text-slate-700">
                        {pendingRequestForCurrentUser.message}
                      </p>
                    ) : null}
                    <form
                      action={completeRenewalActionRequestAction.bind(null, pendingRequestForCurrentUser.id)}
                      className="mt-3 space-y-3"
                    >
                      <label className="block text-sm font-medium text-slate-700" htmlFor="response_status">
                        Response
                      </label>
                      <select
                        id="response_status"
                        name="response_status"
                        defaultValue="needs_more_info"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="renew">Renew</option>
                        <option value="cancel">Cancel</option>
                        <option value="renegotiate">Renegotiate</option>
                        <option value="defer">Defer</option>
                        <option value="needs_more_info">Needs more info</option>
                      </select>
                      <textarea
                        name="response_note"
                        maxLength={500}
                        rows={3}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Optional internal response note."
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">Complete request</Button>
                        <Button
                          type="submit"
                          variant="secondary"
                          formAction={dismissRenewalActionRequestAction.bind(null, pendingRequestForCurrentUser.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </form>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Reminder readiness
                  </p>
                  <p className="mt-2 text-base font-semibold text-ink">{viewModel.ownerReadiness.reminderStatus}</p>
                  <p className="mt-2 text-sm text-slate-600">{viewModel.ownerReadiness.reminderHelp}</p>
                </div>
                {saasOptOutStatus ? (
                  <div className="rounded-2xl border border-urgent/20 bg-urgent/5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          saasOptOutStatus.deadlineWindow === "expired"
                            ? "critical"
                            : saasOptOutStatus.deadlineWindow === "due_7_days" ||
                                saasOptOutStatus.deadlineWindow === "due_30_days"
                              ? "urgent"
                              : "warning"
                        }
                      >
                        SaaS opt-out {saasOptOutStatus.deadlineWindow.replaceAll("_", " ")}
                      </Badge>
                      <Badge>{saasOptOutStatus.workflowStatus.replaceAll("_", " ")}</Badge>
                    </div>
                    <p className="mt-3 text-base font-semibold text-ink">
                      {saasOptOutStatus.softwareName} | {formatDate(saasOptOutStatus.optOutDeadline)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Owner: {saasOptOutStatus.ownerLabel}. Spend at risk:{" "}
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: saasOptOutStatus.spendAtRiskCurrency ?? "USD",
                        maximumFractionDigits: 0
                      }).format(saasOptOutStatus.spendAtRiskAmount)}.
                    </p>
                    {saasOptOutStatus.nextAction ? (
                      <p className="mt-2 text-sm text-slate-700">Next action: {saasOptOutStatus.nextAction}</p>
                    ) : null}
                    {saasOptOutStatus.trustedValueExplanations.length > 0 ? (
                      <div className="mt-2 rounded-2xl border border-success/20 bg-success/5 p-3 text-xs text-slate-600">
                        <p className="font-semibold text-slate-900">Trusted SaaS field overlay</p>
                        <ul className="mt-1 space-y-1">
                          {saasOptOutStatus.trustedValueExplanations.slice(0, 3).map((explanation) => (
                            <li key={explanation}>{explanation}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {saasOptOutStatus.openFindingCount > 0 || saasOptOutStatus.metadataConflictCount > 0 ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Review blockers: {saasOptOutStatus.openFindingCount} open finding
                        {saasOptOutStatus.openFindingCount === 1 ? "" : "s"}
                        {saasOptOutStatus.metadataConflictCount > 0
                          ? `, ${saasOptOutStatus.metadataConflictCount} contract/SaaS metadata conflict${saasOptOutStatus.metadataConflictCount === 1 ? "" : "s"}`
                          : ""}
                        .
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <SaasClockActivationPanel
                    contractId={contract.id}
                    readiness={saasActivationReadiness}
                    canActivate={canReviewExtraction}
                  />
                )}
              </div>
            </div>
            <ReminderTimeline
              reminders={((contract.reminders ?? []) as never[])}
              blockedReason={viewModel.reminderBlockedReason}
            />
          </div>
        </div>
      }
      decisionCyclePanel={
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <div id="decision-panel">
              <RenewalDecisionForm contractId={contract.id} />
            </div>
            <ContractCycleActions
              contractId={contract.id}
              cycleStatus={contract.cycle_status}
              renewalDecisionStatus={contract.renewal_decision_status}
              lastAcknowledgedAt={contract.last_acknowledged_at}
            />
          </div>
          <ManualRenewalTemplatePanel
            contractId={contract.id}
            renewalDecisionStatus={contract.renewal_decision_status}
            initialInput={{
              contractTitle: viewModel.metadata.contract_title,
              counterpartyName: viewModel.metadata.counterparty_name,
              renewalDate: viewModel.metadata.renewal_date,
              expirationDate: viewModel.metadata.expiration_date,
              noticeDeadlineDate: viewModel.metadata.notice_deadline_date
            }}
          />
          <CustomerFeedbackPanel
            title="Template or decision flow confusing?"
            description="Report template or decision friction. NoticeControl will not send anything to the vendor."
            defaultFeedbackType="request_help"
            contractId={contract.id}
            entityType="manual_action_template"
            entityId={contract.id}
            currentRoute={`/dashboard/contracts/${contract.id}`}
            decisionStatus={contract.renewal_decision_status}
            sourceSurface="contract_detail_manual_templates"
          />
        </div>
      }
      secondaryPanel={
        <ContractSecondaryTabs
          tabs={[
            {
              key: "evidence",
              label: "Evidence",
              content: (
                <div className="space-y-6">
                  <ContractExtractionReviewPanel
                    contractId={contract.id}
                    runs={extractionRuns}
                    fields={extractedFields}
                    canReview={canReviewExtraction}
                    currentRoute={`/dashboard/contracts/${contract.id}`}
                    organizationTimezone={organizationTimezone}
                    relationships={documentRelationships}
                  />
                  <RenewalQuoteComparisonPanel
                    contractId={contract.id}
                    comparisons={quoteComparisons}
                    findings={quoteFindings}
                    opportunities={savingsOpportunities}
                    canReview={canReviewExtraction}
                  />
                  {contract.extracted_field_evidence?.length ? (
                    contract.extracted_field_evidence.map(
                      (row: {
                        id: string;
                        field_name: string;
                        snippet: string;
                        confidence: number | null;
                      }) => (
                        <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                          <p className="text-sm font-medium">{row.field_name.replaceAll("_", " ")}</p>
                          <p className="mt-2 text-sm text-slate-600">{row.snippet}</p>
                          <p className="mt-2 text-xs text-slate-500">
                            Confidence:{" "}
                            {row.confidence === null
                              ? "Not scored"
                              : `${Math.round(row.confidence * 100)}%`}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Source: {(row as { source?: string }).source ?? "extraction"}
                          </p>
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-sm text-slate-500">
                      No structured evidence rows have been captured yet.
                    </p>
                  )}
                </div>
              )
            },
            {
              key: "notes",
              label: "Notes",
              content: (
                <div className="space-y-6">
                  <NoteForm contractId={contract.id} />
                  <div className="space-y-4">
                    {(contract.notes ?? []).length ? (
                      (contract.notes as Array<{ id: string; body: string; created_at: string }>).map((note) => (
                        <div key={note.id} className="rounded-xl border border-slate-200 p-4">
                          <p className="text-sm text-slate-700">{note.body}</p>
                          <p className="mt-2 text-xs text-slate-500">{formatDate(note.created_at)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No operator notes have been added yet.</p>
                    )}
                  </div>
                </div>
              )
            },
            {
              key: "audit",
              label: "Audit trail",
              content: (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Enterprise trust timeline
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Trust-sensitive view of reminder gates, evidence review, exception approvals, and decisions.
                    </p>
                    <div className="mt-4">
                      <ContractEnterpriseAuditTimeline events={enterpriseAuditTimeline} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Workflow activity
                    </h3>
                    <div className="mt-4">
                      <ContractActivityFeed
                        auditLogs={((contract.audit_logs ?? []) as never[])}
                        actorLabels={viewModel.actorLabels}
                      />
                    </div>
                  </div>
                </div>
              )
            },
            {
              key: "processing",
              label: "Processing issues",
              content: (
                <div className="space-y-4">
                  {(contract.processing_errors ?? []).length ? (
                    (contract.processing_errors as Array<{
                      id: string;
                      stage: string;
                      error_message: string;
                      created_at: string;
                    }>).map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-medium text-red-900">
                          Processing error: {entry.stage.replaceAll("_", " ")}
                        </p>
                        <p className="mt-2 text-sm text-red-800">{entry.error_message}</p>
                        <p className="mt-2 text-xs text-red-700">{formatDate(entry.created_at)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No processing errors are open for this contract.</p>
                  )}
                </div>
              )
            }
          ]}
        />
      }
    />
  );
}
