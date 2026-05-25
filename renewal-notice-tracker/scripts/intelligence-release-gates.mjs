export const INTELLIGENCE_RELEASE_REQUIRED_DOCS = [
  "docs/intelligence/INTELLIGENCE_RELEASE_GATE.md",
  "docs/intelligence/INTELLIGENCE_RISK_REGISTER.md",
  "docs/intelligence/INTELLIGENCE_TEST_MATRIX.md"
];

export const INTELLIGENCE_RELEASE_BLOCKERS = [
  "financial values lack trust labels",
  "multi-currency values summed without policy",
  "risk score lacks reasons",
  "risk score lacks confidence level",
  "risk score uses unreviewed data as high-confidence",
  "procurement metric lacks drilldown",
  "intelligence route lacks org/role checks",
  "ai copy implies legal advice",
  "dashboard cannot name action it drives"
];

export const INTELLIGENCE_RELEASE_GATE_TEST_FILES = [
  "tests/intelligence-release-gate.test.ts",
  "tests/intelligence-surface-entitlement-consistency.test.tsx",
  "tests/financial-exposure.test.ts",
  "tests/risk-score.test.ts",
  "tests/procurement-query-helpers.test.ts",
  "tests/intelligence-access.test.ts",
  "tests/financial-intelligence-page.test.tsx",
  "tests/procurement-analytics-page.test.tsx",
  "tests/risk-queue-page.test.tsx",
  "tests/risk-explanation-drawer.test.tsx"
];

export const INTELLIGENCE_ROUTE_FILES = [
  "app/dashboard/contracts/[id]/page.tsx",
  "app/dashboard/financial-intelligence/page.tsx",
  "app/dashboard/procurement-analytics/page.tsx",
  "app/dashboard/risk-queue/page.tsx"
];

export const INTELLIGENCE_LEGAL_ADVICE_BLOCKERS = [
  "legal advice",
  "legal action"
];

export function getMissingIntelligenceDocPaths(paths) {
  return INTELLIGENCE_RELEASE_REQUIRED_DOCS.filter((requiredPath) => !paths.includes(requiredPath));
}

export function getMissingReleaseBlockers(docContent) {
  const normalized = (docContent ?? "").toLowerCase();
  return INTELLIGENCE_RELEASE_BLOCKERS.filter((item) => !normalized.includes(item));
}

export function getMissingGateTestFiles(scriptContent) {
  return INTELLIGENCE_RELEASE_GATE_TEST_FILES.filter((testPath) => !scriptContent.includes(testPath));
}
