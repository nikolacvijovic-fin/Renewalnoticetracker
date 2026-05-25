import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import {
  getContractById,
  getCounterparties,
  getOrganizationBilling,
  getOrganizationMembers
} from "@/lib/contracts/kernel-queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewForm } from "@/components/contracts/review-form";
import { ReminderTimeline } from "@/components/contracts/reminder-timeline";
import { NoteForm } from "@/components/contracts/note-form";
import { RenewalDecisionForm } from "@/components/contracts/renewal-decision-form";
import { ContractCycleActions } from "@/components/contracts/contract-cycle-actions";
import { ContractWorkflowSummary } from "@/components/contracts/contract-workflow-summary";
import { ContractActivityFeed } from "@/components/contracts/contract-activity-feed";
import { ContractSecondaryTabs } from "@/components/contracts/contract-secondary-tabs";
import { ContractDetailShell } from "@/components/contracts/contract-detail-shell";
import {
  listPhase1ActiveReviewDirtyFlags,
  getPhase1ReviewMode,
  getPhase1TrustState
} from "@/lib/contracts/phase1-pilot";
import {
  formatReminderRuntimeStatusLabel,
  formatReminderTypeLabel
} from "@/lib/contracts/shipped-reminder-policy";
import {
  buildRiskQueueRow,
  getRiskConfidenceLabel
} from "@/lib/intelligence/risk/dashboard";
import { RiskExplanationDrawer } from "@/components/contracts/risk-explanation-drawer";
import { RiskBadge } from "@/components/contracts/risk-badge";
import { getIntelligenceSurfaceAccess } from "@/lib/intelligence/access";
import { normalizeBillingSnapshot } from "@/lib/billing/entitlements";
import {
  auditRiskBadgeViewed
} from "@/lib/intelligence/audit";
import { formatDate } from "@/lib/utils";

type ContractPageMetadata = Record<string, unknown> & {
  contract_title: string | null;
  counterparty_name: string | null;
  needs_review: boolean | null;
  notice_deadline_date: string | null;
  renewal_date: string | null;
  expiration_date: string | null;
  termination_window: string | null;
  auto_renewal: boolean | null;
  has_conflict?: boolean | null;
  has_derived_date?: boolean | null;
  has_weak_evidence?: boolean | null;
  is_ocr_assisted?: boolean | null;
  is_manual_without_evidence?: boolean | null;
  changes_previously_verified_p0?: boolean | null;
  accepted_unverified_risk_requested?: boolean | null;
  contract_template_key?: string | null;
  field_confidence: Record<string, number>;
  field_source_snippets: Record<string, string>;
};

function normalizeMetadata(metadata: Record<string, unknown>): ContractPageMetadata {
  return {
    ...metadata,
    contract_title: (metadata.contract_title as string | null | undefined) ?? null,
    counterparty_name: (metadata.counterparty_name as string | null | undefined) ?? null,
    needs_review: (metadata.needs_review as boolean | null | undefined) ?? null,
    notice_deadline_date: (metadata.notice_deadline_date as string | null | undefined) ?? null,
    renewal_date: (metadata as { renewal_date?: string | null }).renewal_date ?? null,
    expiration_date: (metadata.expiration_date as string | null | undefined) ?? null,
    termination_window: (metadata as { termination_window?: string | null }).termination_window ?? null,
    auto_renewal: (metadata.auto_renewal as boolean | null | undefined) ?? null,
    has_conflict: (metadata.has_conflict as boolean | null | undefined) ?? false,
    has_derived_date: (metadata.has_derived_date as boolean | null | undefined) ?? false,
    has_weak_evidence: (metadata.has_weak_evidence as boolean | null | undefined) ?? false,
    is_ocr_assisted: (metadata.is_ocr_assisted as boolean | null | undefined) ?? false,
    is_manual_without_evidence:
      (metadata.is_manual_without_evidence as boolean | null | undefined) ?? false,
    changes_previously_verified_p0:
      (metadata.changes_previously_verified_p0 as boolean | null | undefined) ?? false,
    accepted_unverified_risk_requested:
      (metadata.accepted_unverified_risk_requested as boolean | null | undefined) ?? false,
    contract_template_key:
      (metadata.contract_template_key as string | null | undefined) ?? null,
    field_confidence:
      typeof metadata.field_confidence === "object" && metadata.field_confidence !== null
        ? (metadata.field_confidence as Record<string, number>)
        : {},
    field_source_snippets:
      typeof metadata.field_source_snippets === "object" &&
      metadata.field_source_snippets !== null
        ? (metadata.field_source_snippets as Record<string, string>)
        : {}
  };
}

function getOwnerLabel(
  ownerUserId: string | null,
  members: Array<{
    user_id: string;
    user: { full_name: string | null; notification_email: string | null } | null;
  }>
) {
  if (!ownerUserId) return "Unassigned";
  const match = members.find((member) => member.user_id === ownerUserId);
  return match?.user?.full_name ?? match?.user?.notification_email ?? "Assigned";
}

function getNextReminder(
  reminders: Array<{
    remind_at: string;
    reminder_type: string;
    status: string;
    source: string;
  }>
) {
  return [...reminders]
    .filter((reminder) => reminder.status !== "superseded" && reminder.status !== "cancelled")
    .sort((a, b) => a.remind_at.localeCompare(b.remind_at))[0] ?? null;
}

function getNextWorkflowAction(input: {
  trustState: string;
  reviewBlocked: boolean;
  ownerBlocked: boolean;
  cycleStatus: string | null | undefined;
  renewalDecisionStatus: string | null | undefined;
}) {
  if (input.reviewBlocked) {
    return {
      label: "Complete P0 review",
      help: "Confirm the notice deadline, renewal date, expiration date, termination window, and auto-renewal flag before this contract can drive trusted reminders."
    };
  }

  if (input.ownerBlocked) {
    return {
      label: "Assign the accountable owner",
      help: "Trusted reminders stay blocked until one named owner can acknowledge high-risk reminders and make the renewal decision."
    };
  }

  if ((input.cycleStatus ?? "open") === "awaiting_acknowledgment") {
    return {
      label: "Record acknowledgment",
      help: "This cycle is waiting for an explicit acknowledgment before the decision work can continue."
    };
  }

  if (
    (input.renewalDecisionStatus ?? "undecided") === "undecided" &&
    ["Decision Needed", "Due Soon", "Overdue Action"].includes(input.trustState)
  ) {
    return {
      label: "Record the renewal decision",
      help: "The contract is in the decision window. Capture renew, terminate, renegotiate, defer, or no-action-required to move the cycle forward."
    };
  }

  if ((input.cycleStatus ?? "open") === "closed") {
    return {
      label: "Monitor the next cycle",
      help: "The current cycle is closed. Use the timeline and audit trail only if support needs to verify what happened."
    };
  }

  return {
    label: "Monitor the trusted reminder timeline",
    help: "Review is complete, an owner is assigned, and the contract is ready for the weekly operator loop."
  };
}

export default async function ContractDetailPage({
  params
}: {
  params: { id: string };
}) {
  const context = await requireOrganization();
  const { organizationId } = context;
  const [contract, members, counterparties, billing] = await Promise.all([
    getContractById(params.id, organizationId).catch(() => null),
    getOrganizationMembers(organizationId),
    getCounterparties(organizationId),
    getOrganizationBilling(organizationId)
  ]);

  if (!contract || !contract.contract_metadata) notFound();

  const metadataRow = Array.isArray(contract.contract_metadata)
    ? contract.contract_metadata[0]
    : contract.contract_metadata;
  if (!metadataRow) notFound();

  const metadata = normalizeMetadata(metadataRow as Record<string, unknown>);
  const latestFile = [...(contract.contract_files ?? [])].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  )[0];
  const ocrAssisted = latestFile?.extraction_source === "ocr";

  const reviewMetadata = {
    ...metadata,
    owner_user_id: contract.owner_user_id,
    department: contract.department,
    status_tag: contract.status_tag,
    is_ocr_assisted: metadata.is_ocr_assisted || ocrAssisted,
    renewal_decision_status: contract.renewal_decision_status,
    renewal_decision_date: contract.renewal_decision_date,
    cycle_status: contract.cycle_status
  };

  const trustState = getPhase1TrustState({
    owner_user_id: contract.owner_user_id ?? null,
    renewal_decision_status: contract.renewal_decision_status ?? "undecided",
    cycle_status: contract.cycle_status ?? "open",
    contract_metadata: {
      needs_review: metadata.needs_review as boolean | null | undefined,
      notice_deadline_date: metadata.notice_deadline_date as string | null | undefined,
      renewal_date: metadata.renewal_date,
      expiration_date: metadata.expiration_date as string | null | undefined,
      termination_window: metadata.termination_window,
      auto_renewal: metadata.auto_renewal as boolean | null | undefined,
      field_confidence: metadata.field_confidence,
      field_source_snippets: metadata.field_source_snippets,
      is_ocr_assisted: metadata.is_ocr_assisted || ocrAssisted
    }
  });
  const nextReminder = getNextReminder(((contract.reminders ?? []) as never[]));
  const ownerLabel = getOwnerLabel(contract.owner_user_id ?? null, members as never[]);
  const reviewMode = getPhase1ReviewMode(reviewMetadata);
  const dirtyReviewFlags = listPhase1ActiveReviewDirtyFlags(reviewMetadata);
  const reviewBlocked = Boolean(metadata.needs_review);
  const ownerBlocked = !contract.owner_user_id;
  const reminderBlockedReason = reviewBlocked
    ? "blocked_by_review"
    : ownerBlocked
      ? "blocked_by_missing_owner"
      : null;
  const nextAction = getNextWorkflowAction({
    trustState,
    reviewBlocked,
    ownerBlocked,
    cycleStatus: contract.cycle_status,
    renewalDecisionStatus: contract.renewal_decision_status
  });
  const actorLabels = Object.fromEntries(
    members.map((member) => [
      member.user_id,
      member.user?.full_name ?? member.user?.notification_email ?? member.user_id
    ])
  );
  const duplicateCounterpartyIds = new Set(
    counterparties
      .filter((counterparty) => counterparty.duplicate_suggestions.length > 0)
      .map((counterparty) => counterparty.id)
  );
  const riskExplanation = buildRiskQueueRow({
    contractId: contract.id,
    contractTitle: metadata.contract_title ?? "Untitled contract",
    counterpartyName: metadata.counterparty_name ?? "Counterparty not set",
    department: contract.department?.trim() || "Unassigned department",
    ownerLabel,
    workflowTrustState: trustState,
    noticeDeadlineDate: metadata.notice_deadline_date,
    renewalDate: metadata.renewal_date,
    expirationDate: metadata.expiration_date,
    autoRenewalConfirmed: metadata.auto_renewal,
    contractValueAmount:
      typeof (metadataRow as { contract_value_amount?: unknown }).contract_value_amount === "number"
        ? ((metadataRow as { contract_value_amount?: number }).contract_value_amount ?? null)
        : null,
    decisionStatus:
      contract.renewal_decision_status === "renew" ||
      contract.renewal_decision_status === "terminate" ||
      contract.renewal_decision_status === "renegotiate" ||
      contract.renewal_decision_status === "defer" ||
      contract.renewal_decision_status === "no_action_required"
        ? contract.renewal_decision_status
        : "undecided",
    reminderAcknowledged: (contract.cycle_status ?? "open") !== "awaiting_acknowledgment",
    weakEvidence: Boolean(metadata.has_weak_evidence),
    reviewCompleted: !metadata.needs_review,
    acceptedRiskOverride: Boolean(metadata.accepted_unverified_risk_requested),
    priceChangeTrigger:
      typeof (metadataRow as { price_change_trigger?: unknown }).price_change_trigger === "string"
        ? ((metadataRow as { price_change_trigger?: string | null }).price_change_trigger ?? null)
        : null,
    previousDeferWatchlist: contract.renewal_decision_status === "defer",
    reminderDeliveryFailures: (contract.reminders ?? []).filter((reminder) =>
      ["retry_pending", "failed_terminal"].includes(reminder.status ?? "")
    ).length,
    duplicateCounterpartyUncertainty: duplicateCounterpartyIds.has(contract.counterparty_id ?? "")
  });
  const billingSnapshot = normalizeBillingSnapshot({
    organizationId,
    plan_tier: billing.plan_tier,
    subscription_status: billing.subscription_status,
    billing_provider: billing.billing_provider
  });
  const riskBadgeAccess = getIntelligenceSurfaceAccess({
    context,
    billingSnapshot,
    surface: "risk_badge",
    contractOwnerUserId: contract.owner_user_id
  });
  const riskExplanationAccess = getIntelligenceSurfaceAccess({
    context,
    billingSnapshot,
    surface: "risk_explanation",
    contractOwnerUserId: contract.owner_user_id
  });
  if (riskBadgeAccess.allowed) {
    await auditRiskBadgeViewed({
      organizationId,
      actorUserId: context.user.id,
      contractId: contract.id,
      riskBand: riskExplanation.riskBand,
      lowConfidenceCount: riskExplanation.confidenceLevel === "low" ? 1 : 0,
      calculationVersion: riskExplanation.explanationMetadata.calculation_version,
      explanationAvailable: riskExplanationAccess.allowed
    });
  }

  return (
    <ContractDetailShell
      title={(metadata.contract_title as string | null) ?? "Untitled contract"}
      subtitle={`${(metadata.counterparty_name as string | null) ?? "Counterparty not set"} | Updated ${formatDate(contract.updated_at)}`}
      supportingLine="Run the contract through review, owner assignment, reminders, acknowledgment, decision, and closure from one calm workflow."
      primaryAction={
        <Button asChild variant="secondary">
          <a href={`/dashboard/contracts/${contract.id}/ics`}>Export ICS</a>
        </Button>
      }
      badges={
        <>
          <Badge tone={reviewBlocked ? "warning" : "success"}>
            {reviewBlocked ? "Needs review" : "Reviewed"}
          </Badge>
          <Badge>{trustState}</Badge>
          {riskBadgeAccess.allowed ? (
            riskExplanationAccess.allowed ? (
              <>
                <RiskExplanationDrawer
                  explanation={riskExplanation}
                  auditSurface="contract_detail"
                />
                <Badge tone={riskExplanation.confidenceLevel === "low" ? "warning" : "default"}>
                  {getRiskConfidenceLabel(riskExplanation.confidenceLevel)}
                </Badge>
              </>
            ) : (
              <RiskBadge riskBand={riskExplanation.riskBand} />
            )
          ) : null}
          {ocrAssisted ? <Badge tone="warning">OCR-assisted</Badge> : null}
          {metadata.auto_renewal ? <Badge>Auto-renewal</Badge> : null}
        </>
      }
      statusStrip={
        <ContractWorkflowSummary
          nextAction={nextAction}
          items={[
            {
              label: "Trust state",
              value: trustState,
              help:
                trustState === "Verified"
                  ? "Reviewed truth is ready to drive reminders."
                  : "Complete the blocked step before trusting automation."
            },
            {
              label: "Review",
              value: reviewBlocked
                ? reviewMode === "fast_review"
                  ? "Fast review pending"
                  : "Exception review pending"
                : "Review complete",
              help: reviewBlocked
                ? dirtyReviewFlags.length > 0
                  ? `${dirtyReviewFlags.length} trust flag${dirtyReviewFlags.length === 1 ? "" : "s"} require exception review before trusted reminders activate.`
                  : "Confirm the P0 fields before trusted reminders activate."
                : "The P0 record is confirmed and auditable."
            },
            {
              label: "Owner",
              value: ownerLabel,
              help: ownerBlocked
                ? "Assign one accountable owner to unblock trusted workflow."
                : "The owner is accountable for acknowledgment and decisions."
            },
            {
              label: "Due",
              value: reminderBlockedReason
                ? reminderBlockedReason === "blocked_by_review"
                  ? "Blocked by review"
                  : "Blocked by missing owner"
                : nextReminder
                  ? `${formatReminderTypeLabel(nextReminder.reminder_type)} | ${formatDate(nextReminder.remind_at)}`
                  : "No reminder scheduled",
              help: nextReminder
                ? `Current reminder status: ${formatReminderRuntimeStatusLabel(nextReminder.status)}.`
                : reminderBlockedReason
                  ? "Trusted reminders appear automatically once the blocked step is resolved."
                  : "The trusted schedule will appear after review and owner assignment."
            },
            {
              label: "Decision",
              value: (contract.renewal_decision_status ?? "undecided").replaceAll("_", " "),
              help: `Cycle state: ${(contract.cycle_status ?? "open").replaceAll("_", " ")}.`
            }
          ]}
        />
      }
      reviewPanel={
        <ReviewForm
          contractId={contract.id}
          metadata={reviewMetadata as never}
          members={members.map(
            (member: {
              user_id: string;
              user: { full_name: string | null; notification_email: string | null } | null;
            }) => ({
              user_id: member.user_id,
              label: member.user?.full_name ?? member.user?.notification_email ?? member.user_id
            })
          )}
        />
      }
      ownerReminderPanel={
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="panel p-6">
            <h2 className="text-lg font-semibold">Owner and reminder readiness</h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Current owner
                </p>
                <p className="mt-2 text-base font-semibold text-ink">{ownerLabel}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {ownerBlocked
                    ? "Trusted reminders stay blocked until one accountable owner is assigned in review."
                    : "The owner receives trusted reminders, records acknowledgment, and carries the decision forward."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Reminder readiness
                </p>
                <p className="mt-2 text-base font-semibold text-ink">
                  {reminderBlockedReason
                    ? reminderBlockedReason === "blocked_by_review"
                      ? "Blocked by review"
                      : "Blocked by missing owner"
                    : "Trusted schedule active"}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {reviewBlocked || ownerBlocked
                    ? "The schedule stays inactive until reviewed P0 truth and owner assignment are both complete."
                    : nextReminder
                      ? `Next due event: ${formatReminderTypeLabel(nextReminder.reminder_type)} on ${formatDate(nextReminder.remind_at)}.`
                      : "No reminder is due yet, but the contract is ready for the weekly loop."}
                </p>
              </div>
            </div>
          </div>
          <ReminderTimeline
            reminders={((contract.reminders ?? []) as never[])}
            blockedReason={reminderBlockedReason}
          />
        </div>
      }
      decisionCyclePanel={
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
      }
      secondaryPanel={
        <ContractSecondaryTabs
          tabs={[
            {
              key: "evidence",
              label: "Evidence",
              content: (
                <div className="space-y-3">
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
                <ContractActivityFeed
                  auditLogs={((contract.audit_logs ?? []) as never[])}
                  actorLabels={actorLabels}
                />
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
