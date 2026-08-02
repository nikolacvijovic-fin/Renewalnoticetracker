import { buildUnifiedIntelligenceSummary } from "@/lib/intelligence/unified-intelligence-engine";
import type { UnifiedIntelligenceInput } from "@/lib/intelligence/intelligence-types";

export function buildSaasRenewalIntelligence(input: UnifiedIntelligenceInput) {
  return buildUnifiedIntelligenceSummary(input);
}
