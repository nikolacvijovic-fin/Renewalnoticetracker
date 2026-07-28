import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const jobTypes = readFileSync(join(process.cwd(), "lib/background-jobs/job-types.ts"), "utf8");
const jobQueue = readFileSync(join(process.cwd(), "lib/background-jobs/job-queue.ts"), "utf8");
const repository = readFileSync(
  join(process.cwd(), "lib/background-jobs/repositories/admin-background-jobs-repository.ts"),
  "utf8"
);

describe("background job attempt model", () => {
  it("documents attempts as lifecycle event rows, not the canonical retry counter", () => {
    expect(jobTypes).toContain("Attempts are operational lifecycle events");
    expect(jobTypes).toContain("canonical retry count remains background_jobs.attempts");
  });

  it("keeps canonical retry increments on background_jobs, not attempt-row counts", () => {
    expect(jobQueue).toContain("const attemptNumber = current.attempts + 1");
    expect(jobQueue).toContain("attempts: attemptNumber");
    expect(jobQueue).toContain("attemptNumber < current.max_attempts");
    expect(jobQueue).not.toContain("background_job_attempts.length");
  });

  it("records cancellation mode as event metadata for attempt history", () => {
    expect(jobQueue).toContain("cancellation_mode");
    expect(jobQueue).toContain("worker_cancelled");
    expect(jobQueue).toContain("admin_cancelled");
  });

  it("does not retain unsafe upsert code that could revive terminal jobs", () => {
    expect(repository).not.toContain("upsertAdminBackgroundJob");
    expect(jobQueue).not.toContain("upsertAdminBackgroundJob");
  });
});
