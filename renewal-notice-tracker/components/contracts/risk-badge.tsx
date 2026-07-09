import { cn } from "@/lib/utils";
import { getRiskBandLabel } from "@/lib/intelligence/risk/dashboard";
import type { RiskBand } from "@/lib/intelligence/risk/risk-factors";

const RISK_STYLES = {
  low: "bg-success/10 text-success",
  medium: "bg-warning/15 text-amber-800",
  high: "bg-urgent/10 text-urgent",
  critical: "bg-critical/10 text-critical"
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
