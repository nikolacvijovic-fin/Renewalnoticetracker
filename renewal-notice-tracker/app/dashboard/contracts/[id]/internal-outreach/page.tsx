import { notFound } from "next/navigation";
import { hasRequiredRole, requireOrganization } from "@/lib/auth";
import {
  getOrganizationMembers,
  requireScopedContract
} from "@/lib/contracts/kernel-queries";
import { detectOutreachOpportunitiesFormAction } from "@/lib/actions/internal-outreach-intelligence";
import { listInternalOutreachForContract } from "@/lib/internal-outreach-intelligence/internal-outreach-intelligence";
import { InternalOutreachPanel } from "@/components/internal-outreach/internal-outreach-panel";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

function memberLabel(
  members: Awaited<ReturnType<typeof getOrganizationMembers>>,
  userId: string | null | undefined,
  fallback: string
) {
  if (!userId) return fallback;
  const member = members.find((entry) => entry.user_id === userId);
  return member?.user?.full_name ?? member?.user?.notification_email ?? userId;
}

export default async function ContractInternalOutreachPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireOrganization();
  const scopedContract = await requireScopedContract(id, context.organizationId).catch(() => null);
  if (!scopedContract) notFound();

  const members = await getOrganizationMembers(context.organizationId);
  const outreach = await listInternalOutreachForContract({
    organizationId: context.organizationId,
    contractId: id,
    organizationMembers: members
  });
  const canAct = hasRequiredRole(context.role, ["admin", "operator", "reviewer"]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary">
          <a href={`/dashboard/contracts/${id}`}>Back to contract</a>
        </Button>
        {canAct ? (
          <ServerActionForm serverAction={detectOutreachOpportunitiesFormAction.bind(null, id)}>
            <Button type="submit">Refresh outreach signals</Button>
          </ServerActionForm>
        ) : null}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Internal draft-only workflow</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Contract Outreach Intelligence</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Turn existing contract, commercial-decision, quote, and negotiation evidence into internal follow-up drafts for review. Nothing is sent from this page.
        </p>
      </div>

      <InternalOutreachPanel
        items={outreach.opportunities}
        approverOptions={members.map((member) => ({
          userId: member.user_id,
          label: memberLabel(members, member.user_id, member.user_id)
        }))}
        currentUserId={context.user.id}
        canAct={canAct}
      />
    </section>
  );
}
