import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireInternalRole = vi.fn();
const getAdminBackgroundJobHealthSnapshot = vi.fn();

vi.mock("@/lib/internal-access", () => ({
  requireInternalRole
}));

vi.mock("@/lib/background-jobs/repositories/admin-background-jobs-repository", () => ({
  getAdminBackgroundJobHealthSnapshot
}));

describe("admin background jobs page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires internal access before loading job health", async () => {
    requireInternalRole.mockRejectedValue(new Error("REDIRECT:/dashboard"));
    const Page = (await import("@/app/admin/background-jobs/page")).default;

    await expect(
      Page({ searchParams: Promise.resolve({ organizationId: "org-1" }) })
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(getAdminBackgroundJobHealthSnapshot).not.toHaveBeenCalled();
  });

  it("renders queue health metrics without raw payloads", async () => {
    requireInternalRole.mockResolvedValue({ role: "internal_support" });
    getAdminBackgroundJobHealthSnapshot.mockResolvedValue({
      jobs: {
        data: [
          {
            id: "job-1",
            job_type: "trusted_reminder_delivery",
            status: "queued",
            created_at: new Date().toISOString()
          },
          {
            id: "job-2",
            job_type: "trusted_reminder_delivery",
            status: "dead_lettered",
            created_at: new Date().toISOString()
          }
        ],
        error: null
      },
      attempts: {
        data: [
          {
            id: "attempt-1",
            job_id: "job-2",
            status: "dead_lettered",
            worker_id: "worker-1",
            attempt_number: 3,
            error_code: "ERR_BACKGROUND_JOB_PROVIDER_001"
          }
        ],
        error: null
      }
    });
    const Page = (await import("@/app/admin/background-jobs/page")).default;

    render(
      await Page({
        searchParams: Promise.resolve({ organizationId: "org-1" })
      })
    );

    expect(screen.getByText("Background Jobs")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Dead-lettered")).toBeInTheDocument();
    expect(screen.getByText(/Failure rate:/)).toBeInTheDocument();
    expect(JSON.stringify(screen.queryByText(/raw contract text/i))).not.toContain("raw contract text");
  });
});
