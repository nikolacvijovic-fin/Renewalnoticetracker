import Link from "next/link";
import type { FinancialExposureBreakdownRow } from "@/lib/intelligence/financial/dashboard";
import { cn } from "@/lib/utils";

const TRUST_STYLES = {
  high: "text-success",
  medium: "text-amber-800",
  low: "text-urgent",
  blocked: "text-critical"
} as const;

export function FinancialExposureBreakdown({
  title,
  description,
  rows,
  emptyState
}: {
  title: string;
  description: string;
  rows: FinancialExposureBreakdownRow[];
  emptyState: string;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          {emptyState}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.key}
              href={row.href}
              className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-brand-200 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{row.label}</p>
                <p className={cn("mt-1 text-xs font-medium", TRUST_STYLES[row.trustLevel])}>
                  {row.trustLabel}
                </p>
                {row.warnings[0] ? (
                  <p className="mt-1 text-xs text-amber-800">{row.warnings[0].message}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted">
                    {row.includedContractCount} contract{row.includedContractCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-900">{row.valueLabel}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
