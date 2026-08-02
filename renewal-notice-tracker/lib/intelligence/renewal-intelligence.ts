import { buildUnifiedIntelligenceSummary } from "@/lib/intelligence/unified-intelligence-engine";
import type { UnifiedIntelligenceInput } from "@/lib/intelligence/intelligence-types";

export function buildRenewalDefenseIntelligence(input: UnifiedIntelligenceInput) {
  return buildUnifiedIntelligenceSummary(input);
}
