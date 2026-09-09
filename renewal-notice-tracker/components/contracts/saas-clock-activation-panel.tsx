import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { activateReviewedContractForSaasClockFormAction } from "@/lib/actions/saas-renewal-defense";
import {
  SAAS_ACTIVATION_BLOCKER_LABELS,
  type SaasContractActivationReadiness
} from "@/lib/saas/contract-activation";
import type { SaasActivationCandidate } from "@/lib/saas/queries";

export function SaasClockActivationPanel({
  contractId,
  readiness,
  canActivate,
  candidates
}: {
  contractId: string;
  readiness: SaasContractActivationReadiness;
  canActivate: boolean;
  candidates: SaasActivationCandidate[];
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
            {candidates.length > 0 ? (
              <label className="mb-3 block text-sm font-medium text-slate-700">
                Existing SaaS product
                <select
                  name="software_id"
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Choose the reviewed product</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} ({candidate.vendor_name ?? "Vendor not set"})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <input type="hidden" name="create_new" value="true" />
                <p className="mb-3 text-xs text-slate-600">
                  Activation will create one SaaS product from the reviewed title and vendor.
                </p>
              </>
            )}
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
          Only an organization admin or operator can perform activation.
        </p>
      ) : null}
    </div>
  );
}
