import { cn } from "@/lib/utils";
import { getRiskBandLabel } from "@/lib/intelligence/risk/dashboard";
import type { RiskBand } from "@/lib/intelligence/risk/risk-factors";

const RISK_STYLES = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-rose-100 text-rose-800"
} as const;

export function RiskBadge({
  riskBand,
  className
}: {
  riskBand: RiskBand;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        RISK_STYLES[riskBand],
        className
      )}
    >
      {getRiskBandLabel(riskBand)}
    </span>
  );
}
