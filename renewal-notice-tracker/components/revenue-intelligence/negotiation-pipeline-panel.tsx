import type { RevenueOpportunityItem } from "@/lib/revenue-intelligence/revenue-types";
import { SavingsPipelinePanel } from "@/components/revenue-intelligence/savings-pipeline-panel";

export function NegotiationPipelinePanel({ opportunities }: { opportunities: RevenueOpportunityItem[] }) {
  return (
    <SavingsPipelinePanel
      opportunities={opportunities}
      type="negotiation"
      title="Negotiation pipeline"
      emptyCopy="No negotiation pipeline metrics yet."
    />
  );
}
