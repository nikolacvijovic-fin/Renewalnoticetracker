import { archiveRevenueSignalFormAction } from "@/lib/actions/revenue-intelligence";
import type { RevenueRiskQueueItem } from "@/lib/revenue-intelligence/revenue-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

function tone(severity: RevenueRiskQueueItem["severity"]) {
  if (severity === "critical") return "critical" as const;
  if (severity === "high") return "urgent" as const;
  if (severity === "medium") return "warning" as const;
  return "safe" as const;
}

export function RevenueRiskQueue({ items, canAct }: { items: RevenueRiskQueueItem[]; canAct: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Revenue risk queue</h2>
      <div className="mt-4 space-y-3">
        {items.length ? items.slice(0, 12).map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={tone(item.severity)}>{item.severity}</Badge>
                  <Badge tone="automation">{item.signal_type.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  {item.contract_id ? <a className="underline" href={`/dashboard/contracts/${item.contract_id}`}>Contract</a> : null}
                  {item.commercial_decision_id && item.contract_id ? <a className="underline" href={`/dashboard/contracts/${item.contract_id}/commercial-decision`}>Decision</a> : null}
                  {item.outreach_opportunity_id && item.contract_id ? <a className="underline" href={`/dashboard/contracts/${item.contract_id}/internal-outreach`}>Outreach</a> : null}
                </div>
              </div>
              {canAct ? (
                <ServerActionForm serverAction={archiveRevenueSignalFormAction.bind(null, item.id)}>
                  <Button type="submit" variant="ghost">Archive</Button>
                </ServerActionForm>
              ) : null}
            </div>
          </div>
        )) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-muted">
            No active revenue risk signals yet. Generate a snapshot after quote, decision, negotiation, or outreach evidence exists.
          </p>
        )}
      </div>
    </div>
  );
}
