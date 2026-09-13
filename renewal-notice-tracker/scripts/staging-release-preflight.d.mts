export type StagingReleasePreflightResult = {
  missingByGroup: Record<string, string[]>;
  operationLimits: string[];
  invalidUrls: string[];
};

export function getStagingReleasePreflightIssues(
  env?: Record<string, string | undefined>
): StagingReleasePreflightResult;
export function hasStagingReleasePreflightFailures(result: StagingReleasePreflightResult): boolean;
export function printStagingReleasePreflight(
  result: StagingReleasePreflightResult,
  write?: (line: string) => void
): void;
