import type { CommercialCapabilitySummaryItem } from "@/lib/billing/entitlements";
import { Badge } from "@/components/ui/badge";

export function CommercialCapabilitySummary({
  title = "Commercial access",
  description,
  items
}: {
  title?: string;
  description?: string;
  items: CommercialCapabilitySummaryItem[];
}) {
  return (
    <div className="panel space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.feature} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{item.label}</p>
              <Badge tone={item.access.allowed ? "success" : "warning"}>
                {item.access.allowed ? "Available" : "Limited"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-slate-500">{item.access.message}</p>
            {item.access.cta?.label ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Suggested next step: {item.access.cta.label}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
