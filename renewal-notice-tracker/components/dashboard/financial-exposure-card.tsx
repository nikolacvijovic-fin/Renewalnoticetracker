import Link from "next/link";
import type { FinancialExposureCardData } from "@/lib/intelligence/financial/dashboard";
import { cn } from "@/lib/utils";

const TRUST_STYLES = {
  high: "bg-success/10 text-success",
  medium: "bg-warning/15 text-amber-800",
  low: "bg-urgent/10 text-urgent",
  blocked: "bg-critical/10 text-critical"
} as const;

export function FinancialExposureCard({ card }: { card: FinancialExposureCardData }) {
  return (
    <Link
      href={card.href}
      className="panel flex h-full flex-col gap-4 p-5 transition hover:border-brand-200 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{card.title}</p>
          <p className="mt-2 text-xs leading-5 text-muted">{card.description}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            TRUST_STYLES[card.trustLevel]
          )}
        >
          {card.trustLabel}
        </span>
      </div>
      <div>
        <p className="text-3xl font-semibold text-slate-900">{card.valueLabel}</p>
        <p className="mt-2 text-xs text-muted">
          {card.includedContractCount} included, {card.excludedContractCount} excluded
        </p>
      </div>
      {card.emptyState ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {card.emptyState}
        </div>
      ) : null}
      {card.warnings.length > 0 ? (
        <ul className="space-y-1 text-xs text-amber-800">
          {card.warnings.slice(0, 2).map((warning) => (
            <li key={`${card.slug}-${warning.code}`}>{warning.message}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Open the underlying contracts</p>
      )}
    </Link>
  );
}
