import { hasRequiredRole, requireOrganization } from "@/lib/auth";
import { getOrganizationMembers } from "@/lib/contracts/kernel-queries";
import { listInternalOutreachQueue } from "@/lib/internal-outreach-intelligence/internal-outreach-intelligence";
import { InternalOutreachPanel } from "@/components/internal-outreach/internal-outreach-panel";
import { Badge } from "@/components/ui/badge";

function memberLabel(
  members: Awaited<ReturnType<typeof getOrganizationMembers>>,
  userId: string | null | undefined,
  fallback: string
) {
  if (!userId) return fallback;
  const member = members.find((entry) => entry.user_id === userId);
  return member?.user?.full_name ?? member?.user?.notification_email ?? userId;
}

export default async function InternalOutreachQueuePage() {
  const context = await requireOrganization();
  const members = await getOrganizationMembers(context.organizationId);
  const queue = await listInternalOutreachQueue({
    organizationId: context.organizationId,
    limit: 50,
    organizationMembers: members
  });
  const canAct = hasRequiredRole(context.role, ["admin", "operator", "reviewer"]);

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone="automation">Internal Revenue Intelligence</Badge>
          <Badge tone="locked">No external sending</Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-ink">Internal Outreach Intelligence Queue</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Draft internal owner, finance, procurement, legal, and account-team follow-ups from renewal evidence. This queue prepares reviewable copy only; it does not send email, enrich contacts, or run campaigns.
        </p>
      </div>

      <InternalOutreachPanel
        items={queue.opportunities}
        approverOptions={members.map((member) => ({
          userId: member.user_id,
          label: memberLabel(members, member.user_id, member.user_id)
        }))}
        currentUserId={context.user.id}
        canAct={canAct}
        emptyMessage="No internal outreach opportunities in the queue."
      />
    </section>
  );
}
