import { notFound } from "next/navigation";
import { hasRequiredRole, requireOrganization } from "@/lib/auth";
import {
  getOrganizationMembers,
  requireScopedContract
} from "@/lib/contracts/kernel-queries";
import { getCommercialDecisionWorkbench } from "@/lib/commercial-decision-workbench/commercial-decision-workbench";
import { listNegotiationWorkflowForDecision } from "@/lib/negotiation-workflow/negotiation-workflow";
import { CommercialDecisionEmptyState } from "@/components/commercial-decision/commercial-decision-empty-state";
import { CommercialDecisionWorkbenchPanel } from "@/components/commercial-decision/commercial-decision-workbench-panel";
import { Button } from "@/components/ui/button";

function memberLabel(
  members: Awaited<ReturnType<typeof getOrganizationMembers>>,
  userId: string | null | undefined,
  fallback: string
) {
  if (!userId) return fallback;
  const member = members.find((entry) => entry.user_id === userId);
  return member?.user?.full_name ?? member?.user?.notification_email ?? userId;
}

export default async function CommercialDecisionPage({
  params
}: {
  params: { id: string };
}) {
  const context = await requireOrganization();
  const scopedContract = await requireScopedContract(params.id, context.organizationId).catch(() => null);
  if (!scopedContract) notFound();

  const [workbench, members] = await Promise.all([
    getCommercialDecisionWorkbench({
      organizationId: context.organizationId,
      contractId: params.id
    }),
    getOrganizationMembers(context.organizationId)
  ]);
  const negotiationWorkflow = workbench.decision
    ? await listNegotiationWorkflowForDecision({
        organizationId: context.organizationId,
        commercialDecisionId: workbench.decision.id
      })
    : { brief: null, evidenceLinks: [], drafts: [], approvalSteps: [], playbookItems: [] };
  const canAct = hasRequiredRole(context.role, ["admin", "operator", "reviewer"]);
  const canReassignApprover = hasRequiredRole(context.role, ["admin", "operator"]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary">
          <a href={`/dashboard/contracts/${params.id}`}>Back to contract</a>
        </Button>
      </div>
      {workbench.decision ? (
        <CommercialDecisionWorkbenchPanel
          decision={workbench.decision}
          evidenceLinks={workbench.evidenceLinks}
          approvalSteps={workbench.approvalSteps}
          snapshots={workbench.snapshots}
          ownerLabel={memberLabel(members, workbench.decision.owner_user_id, "Missing owner")}
          approverLabel={memberLabel(members, workbench.decision.approver_user_id, "No approver assigned")}
          approverOptions={members.map((member) => ({
            userId: member.user_id,
            label: memberLabel(members, member.user_id, member.user_id)
          }))}
          currentUserId={context.user.id}
          canAct={canAct}
          canReassignApprover={canReassignApprover}
          negotiationWorkflow={negotiationWorkflow}
        />
      ) : (
        <CommercialDecisionEmptyState contractId={params.id} canCreate={canAct} />
      )}
    </section>
  );
}
