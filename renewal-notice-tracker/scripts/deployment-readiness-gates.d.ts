declare module "@/scripts/deployment-readiness-gates.mjs" {
  export type DeploymentReadinessIssue = {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };

  export const REQUIRED_DEPLOYMENT_SCRIPTS: readonly string[];
  export const REQUIRED_DEPLOYMENT_DOCS: readonly string[];
  export const REQUIRED_OPERATIONAL_CONTRACTS: readonly string[];
  export const REQUIRED_MIGRATION_SLUGS: readonly string[];
  export const REQUIRED_RUNBOOK_TOPICS: readonly string[];

  export function isProductionEnvironment(env?: Record<string, string | undefined>): boolean;
  export function getProductionConfigSafetyIssues(
    env?: Record<string, string | undefined>
  ): DeploymentReadinessIssue[];
  export function getBackgroundJobConfigIssues(
    env?: Record<string, string | undefined>
  ): DeploymentReadinessIssue[];
  export function getMissingRequiredScripts(packageJson: {
    scripts?: Record<string, string>;
  }): string[];
  export function getRepoStructureIssues(repoRoot: string): DeploymentReadinessIssue[];
  export function getMigrationSafetyIssues(repoRoot: string): DeploymentReadinessIssue[];
  export function getRunbookCoverageIssues(repoRoot: string): DeploymentReadinessIssue[];
  export function getFutureFeatureTruthIssues(repoRoot: string): DeploymentReadinessIssue[];
  export function getScriptReadinessIssues(packageJson: {
    scripts?: Record<string, string>;
  }): DeploymentReadinessIssue[];
  export function getDeploymentReadinessIssues(input: {
    repoRoot: string;
    env?: Record<string, string | undefined>;
    packageJson?: { scripts?: Record<string, string> };
  }): DeploymentReadinessIssue[];
}
