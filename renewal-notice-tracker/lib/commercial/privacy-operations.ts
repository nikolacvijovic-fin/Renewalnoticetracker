import type { Json } from "@/lib/supabase/database.types";

export type PrivacyOperationsSnapshot = {
  exportRequests30d: number;
  openDeletionRequests: number;
  latestExportAt: string | null;
  latestDeletionRequestAt: string | null;
  latestBackupCheckAt: string | null;
  latestBackupStatus: string | null;
  latestRestoreTestedAt: string | null;
  status: "healthy" | "watch" | "risk";
  blockers: string[];
  warnings: string[];
};

function ageInDays(timestamp: string | null) {
  if (!timestamp) return null;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  return ageMs / (24 * 60 * 60 * 1000);
}

export function calculatePrivacyOperationsSnapshot(input: {
  exportRequests30d: number;
  openDeletionRequests: number;
  latestExportAt: string | null;
  latestDeletionRequestAt: string | null;
  latestBackupCheckAt: string | null;
  latestBackupStatus: string | null;
  latestRestoreTestedAt: string | null;
}): PrivacyOperationsSnapshot {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const backupAgeDays = ageInDays(input.latestBackupCheckAt);
  const restoreAgeDays = ageInDays(input.latestRestoreTestedAt);

  if (!input.latestBackupCheckAt) {
    blockers.push("No backup readiness check has been recorded yet.");
  }

  if (backupAgeDays !== null && backupAgeDays > 7) {
    blockers.push("Latest backup readiness evidence is older than 7 days.");
  }

  if (input.latestBackupStatus && input.latestBackupStatus !== "healthy") {
    blockers.push(`Latest backup readiness check is ${input.latestBackupStatus}.`);
  }

  if (input.openDeletionRequests > 0) {
    warnings.push(`${input.openDeletionRequests} deletion requests are still open.`);
  }

  if (!input.latestRestoreTestedAt) {
    warnings.push("No restore drill evidence is recorded yet.");
  }

  if (restoreAgeDays !== null && restoreAgeDays > 45) {
    warnings.push("Latest restore drill evidence is older than 45 days.");
  }

  if (input.exportRequests30d === 0) {
    warnings.push("No recent export evidence is recorded for this workspace.");
  }

  const status: PrivacyOperationsSnapshot["status"] =
    blockers.length > 0 ? "risk" : warnings.length > 1 ? "watch" : "healthy";

  return {
    exportRequests30d: input.exportRequests30d,
    openDeletionRequests: input.openDeletionRequests,
    latestExportAt: input.latestExportAt,
    latestDeletionRequestAt: input.latestDeletionRequestAt,
    latestBackupCheckAt: input.latestBackupCheckAt,
    latestBackupStatus: input.latestBackupStatus,
    latestRestoreTestedAt: input.latestRestoreTestedAt,
    status,
    blockers,
    warnings
  };
}

export function buildExportRequestEvidence(input: {
  format: string;
  rowCount: number;
  source: string;
}): Json {
  return {
    format: input.format,
    row_count: input.rowCount,
    source: input.source
  } as Json;
}

export function buildDeletionRequestEvidence(input: {
  requestedByRole: string;
  source: string;
}): Json {
  return {
    requested_by_role: input.requestedByRole,
    source: input.source
  } as Json;
}

export function buildBackupReadinessEvidence(input: {
  trigger: string;
  failures?: string[];
}): Json {
  return {
    trigger: input.trigger,
    failures: input.failures ?? []
  } as Json;
}

export function buildRestoreDrillEvidence(input: {
  trigger: string;
  outcome: "passed" | "failed";
  scope: string;
  recoveryTimeMinutes?: number | null;
  failures?: string[];
}): Json {
  return {
    trigger: input.trigger,
    outcome: input.outcome,
    scope: input.scope,
    recovery_time_minutes: input.recoveryTimeMinutes ?? null,
    failures: input.failures ?? []
  } as Json;
}
