import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import {
  getContractById,
  getCounterparties,
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
import { getRiskConfidenceLabel } from "@/lib/intelligence/risk/dashboard";
import { RiskExplanationDrawer } from "@/components/contracts/risk-explanation-drawer";
import { RiskBadge } from "@/components/contracts/risk-badge";
import {
  auditRiskBadgeViewed
} from "@/lib/intelligence/audit";
import { formatDate } from "@/lib/utils";
import { buildContractDetailViewModel } from "@/lib/contracts/contract-detail-view";

export default async function ContractDetailPage({
  params
}: {
  params: { id: string };
}) {
  const context = await requireOrganization();
  const { organizationId } = context;
  const [contract, members, counterparties] = await Promise.all([
    getContractById(params.id, organizationId).catch(() => null),
    getOrganizationMembers(organizationId),
    getCounterparties(organizationId)
  ]);

  if (!contract || !contract.contract_metadata) notFound();

  const viewModel = await buildContractDetailViewModel({
    context,
    contract,
    members,
    counterparties
  });
  const riskBadgeAccess = viewModel.intelligenceAccess.accessBySurface.risk_badge;
  const riskExplanationAccess = viewModel.intelligenceAccess.accessBySurface.risk_explanation;
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

  return (
    <ContractDetailShell
      title={viewModel.title}
      subtitle={`${viewModel.counterpartyName} | Updated ${formatDate(contract.updated_at)}`}
      supportingLine="Run the contract through review, owner assignment, reminders, acknowledgment, decision, and closure from one calm workflow."
      primaryAction={
        <Button asChild variant="secondary">
          <a href={`/dashboard/contracts/${contract.id}/ics`}>Export ICS</a>
        </Button>
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
        </>
      }
      statusStrip={
        <ContractWorkflowSummary
          nextAction={viewModel.nextAction}
          items={viewModel.workflowItems}
        />
      }
      reviewPanel={
        <ReviewForm
          contractId={contract.id}
          metadata={viewModel.reviewMetadata as never}
          members={viewModel.memberLabels}
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
                <p className="mt-2 text-base font-semibold text-ink">{viewModel.ownerReadiness.ownerStatus}</p>
                <p className="mt-2 text-sm text-slate-600">{viewModel.ownerReadiness.ownerHelp}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Reminder readiness
                </p>
                <p className="mt-2 text-base font-semibold text-ink">{viewModel.ownerReadiness.reminderStatus}</p>
                <p className="mt-2 text-sm text-slate-600">{viewModel.ownerReadiness.reminderHelp}</p>
              </div>
            </div>
          </div>
          <ReminderTimeline
            reminders={((contract.reminders ?? []) as never[])}
            blockedReason={viewModel.reminderBlockedReason}
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
                  actorLabels={viewModel.actorLabels}
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
