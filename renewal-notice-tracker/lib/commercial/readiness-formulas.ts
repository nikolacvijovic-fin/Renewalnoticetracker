const READINESS_WEIGHTS = {
  authzTenant: 0.2,
  testingRelease: 0.2,
  reliability: 0.15,
  billing: 0.1,
  adminInternal: 0.1,
  privacyCompliance: 0.1,
  observabilityIncident: 0.1,
  analyticsQuality: 0.05
} as const;

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function calculateOverallReadiness(input: {
  authzTenant: number;
  testingRelease: number;
  reliability: number;
  billing: number;
  adminInternal: number;
  privacyCompliance: number;
  observabilityIncident: number;
  analyticsQuality: number;
}) {
  const score =
    clampScore(input.authzTenant) * READINESS_WEIGHTS.authzTenant +
    clampScore(input.testingRelease) * READINESS_WEIGHTS.testingRelease +
    clampScore(input.reliability) * READINESS_WEIGHTS.reliability +
    clampScore(input.billing) * READINESS_WEIGHTS.billing +
    clampScore(input.adminInternal) * READINESS_WEIGHTS.adminInternal +
    clampScore(input.privacyCompliance) * READINESS_WEIGHTS.privacyCompliance +
    clampScore(input.observabilityIncident) * READINESS_WEIGHTS.observabilityIncident +
    clampScore(input.analyticsQuality) * READINESS_WEIGHTS.analyticsQuality;

  return Math.round(score);
}

export { READINESS_WEIGHTS };
