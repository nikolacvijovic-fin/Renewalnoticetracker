declare module "@/scripts/intelligence-release-gates.mjs" {
  export const INTELLIGENCE_RELEASE_REQUIRED_DOCS: readonly string[];
  export const INTELLIGENCE_RELEASE_BLOCKERS: readonly string[];
  export const INTELLIGENCE_RELEASE_GATE_TEST_FILES: readonly string[];
  export const INTELLIGENCE_ROUTE_FILES: readonly string[];
  export const INTELLIGENCE_LEGAL_ADVICE_BLOCKERS: readonly string[];

  export function getMissingIntelligenceDocPaths(paths: string[]): string[];
  export function getMissingReleaseBlockers(docContent: string | undefined | null): string[];
  export function getMissingGateTestFiles(scriptContent: string): string[];
}
