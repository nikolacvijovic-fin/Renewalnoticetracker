import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { activateReviewedContractForSaasClockFormAction } from "@/lib/actions/saas-renewal-defense";
import {
  SAAS_ACTIVATION_BLOCKER_LABELS,
  type SaasContractActivationReadiness
} from "@/lib/saas/contract-activation";

export function SaasClockActivationPanel({
  contractId,
  readiness,
  canActivate
}: {
  contractId: string;
  readiness: SaasContractActivationReadiness;
  canActivate: boolean;
}) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={readiness.allowed ? "success" : "warning"}>
          {readiness.allowed ? "Reviewed and ready" : "Activation blocked"}
        </Badge>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
          SaaS Opt-Out Clock
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-700">{readiness.nextAction}</p>
      {readiness.blockers.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {readiness.blockers.map((blocker) => (
            <li key={blocker}>- {SAAS_ACTIVATION_BLOCKER_LABELS[blocker]}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {readiness.allowed && canActivate ? (
          <form action={activateReviewedContractForSaasClockFormAction.bind(null, contractId)}>
            <Button type="submit">Activate for Opt-Out Clock</Button>
          </form>
        ) : (
          <Button asChild variant="secondary">
            <Link href="#contract-review">Open contract review</Link>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/dashboard/saas-opt-out-clock">View Opt-Out Clock</Link>
        </Button>
      </div>
      {!canActivate ? (
        <p className="mt-3 text-xs text-slate-500">
          A review-capable organization role must perform activation.
        </p>
      ) : null}
    </div>
  );
}
