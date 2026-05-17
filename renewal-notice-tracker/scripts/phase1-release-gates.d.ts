declare module "@/scripts/phase1-release-gates.mjs" {
  export const PHASE1_RELEASE_CRITICAL_PATHS: readonly string[];
  export const PHASE1_RELEASE_QUALITY_GATES: readonly string[];
  export const PHASE1_EMAIL_RELEASE_REQUIREMENTS: readonly (readonly [string, string])[];
  export const PHASE1_AUTONOMY_REQUIRED_CHECKLIST: readonly string[];
  export const PHASE1_HIDDEN_RESCUE_BLOCKERS: readonly string[];

  export function getMissingReleaseMetadata(env: Record<string, string | undefined>): string[];
  export function getMissingP0BrowserInputs(env: Record<string, string | undefined>): string[];
  export function getMissingEmailReleaseInputs(env: Record<string, string | undefined>): string[];
  export function getMissingTwoWeekAutonomyChecklist(docContent: string | undefined | null): string[];
}
