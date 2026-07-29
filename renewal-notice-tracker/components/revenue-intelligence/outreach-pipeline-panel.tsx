import type { RevenueOpportunityItem } from "@/lib/revenue-intelligence/revenue-types";
import { SavingsPipelinePanel } from "@/components/revenue-intelligence/savings-pipeline-panel";

export function OutreachPipelinePanel({ opportunities }: { opportunities: RevenueOpportunityItem[] }) {
  return (
    <SavingsPipelinePanel
      opportunities={opportunities}
      type="outreach"
      title="Internal outreach pipeline"
      emptyCopy="No internal outreach pipeline metrics yet."
    />
  );
}
