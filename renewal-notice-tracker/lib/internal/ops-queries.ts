export {
  getAdminDebugData,
  getAdminOperationalSnapshot,
  getPrivacyOperationsSnapshot
} from "@/lib/contracts/queries";

export { getOrganizationBilling } from "@/lib/contracts/kernel-queries";

import { getAdminDebugData, getAdminOperationalSnapshot } from "@/lib/contracts/queries";

export async function refreshInternalRescueSnapshot(organizationId: string) {
  const [snapshot, debug] = await Promise.all([
    getAdminOperationalSnapshot(organizationId),
    getAdminDebugData(organizationId)
  ]);

  const importsNeedingRescue = debug.importJobs.filter(
    (job) => job.status === "failed" || job.status === "completed_with_errors"
  ).length;

  return {
    failedReminders: snapshot.failedReminders,
    retryPendingReminders: snapshot.retryPendingReminders,
    failedNotifications: snapshot.failedNotifications,
    duplicateSuppressedNotifications: snapshot.duplicateSuppressedNotifications,
    extractionFailureCount: snapshot.extractionFailureCount,
    retryScheduledRuns: snapshot.retryScheduledRuns,
    terminalFailureRuns: snapshot.terminalFailureRuns,
    importsNeedingRescue
  };
}
