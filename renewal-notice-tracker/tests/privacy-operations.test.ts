import { describe, expect, it } from "vitest";
import { calculatePrivacyOperationsSnapshot } from "@/lib/commercial/privacy-operations";

describe("privacy operations snapshot", () => {
  it("stays conservative when backup checks and restore drills are missing", () => {
    const snapshot = calculatePrivacyOperationsSnapshot({
      exportRequests30d: 0,
      openDeletionRequests: 0,
      latestExportAt: null,
      latestDeletionRequestAt: null,
      latestBackupCheckAt: null,
      latestBackupStatus: null,
      latestRestoreTestedAt: null
    });

    expect(snapshot.status).toBe("risk");
    expect(snapshot.blockers.some((item) => item.includes("No backup readiness check"))).toBe(true);
    expect(snapshot.warnings.some((item) => item.includes("No restore drill evidence"))).toBe(true);
  });

  it("flags stale backup and restore evidence instead of treating it as healthy forever", () => {
    const snapshot = calculatePrivacyOperationsSnapshot({
      exportRequests30d: 2,
      openDeletionRequests: 0,
      latestExportAt: "2026-04-18T12:00:00.000Z",
      latestDeletionRequestAt: null,
      latestBackupCheckAt: "2026-04-01T10:00:00.000Z",
      latestBackupStatus: "healthy",
      latestRestoreTestedAt: "2026-02-01T09:00:00.000Z"
    });

    expect(snapshot.status).toBe("risk");
    expect(snapshot.blockers.some((item) => item.includes("older than 7 days"))).toBe(true);
    expect(snapshot.warnings.some((item) => item.includes("older than 45 days"))).toBe(true);
  });
});
