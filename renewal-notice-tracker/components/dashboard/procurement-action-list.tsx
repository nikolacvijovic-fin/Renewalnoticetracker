import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IntelligenceTrustLevel, IntelligenceWarning } from "@/lib/intelligence/shared/types";

const TRUST_TONES: Record<IntelligenceTrustLevel, "success" | "warning" | "danger" | "default"> = {
  high: "success",
  medium: "warning",
  low: "warning",
  blocked: "danger"
};

export type ProcurementActionListItem = {
  key: string;
  label: string;
  primaryValue: string;
  secondaryValue?: string | null;
  trustLevel: IntelligenceTrustLevel;
  trustLabel: string;
  warning?: IntelligenceWarning | null;
  href: string;
  actionLabel: string;
};

export function ProcurementActionList({
  title,
  description,
  items,
  emptyState
}: {
  title: string;
  description: string;
  items: ProcurementActionListItem[];
  emptyState: string;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          {emptyState}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border border-slate-200 px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                    <Badge tone={TRUST_TONES[item.trustLevel]}>{item.trustLabel}</Badge>
                  </div>
                  {item.warning ? (
                    <p className="mt-2 text-xs text-amber-700">{item.warning.message}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{item.primaryValue}</p>
                  {item.secondaryValue ? (
                    <p className="mt-1 text-xs text-slate-500">{item.secondaryValue}</p>
                  ) : null}
                </div>
              </div>
              <Button asChild className="mt-4" variant="ghost">
                <Link href={item.href}>{item.actionLabel}</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
