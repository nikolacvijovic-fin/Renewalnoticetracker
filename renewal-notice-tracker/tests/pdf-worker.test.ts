// @vitest-environment node
import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/background-jobs/job-queue", () => ({ claimBackgroundJobs: mocks.claim }));
vi.mock("@/lib/background-jobs/job-runner", () => ({ runClaimedBackgroundJob: mocks.run }));
import { runPdfWorkerOnce } from "@/lib/background-jobs/pdf-worker";

describe("standalone PDF worker", () => {
  beforeEach(() => vi.resetAllMocks());

  it("builds and loads the actual worker outside Next and without an HTTP request", () => {
    execFileSync(process.execPath, ["scripts/build-pdf-worker.mjs"], { stdio: "pipe" });
    const output = execFileSync(process.execPath, ["dist/pdf-worker.cjs", "--check"], { encoding: "utf8" });
    expect(output).toContain("PDF worker module loaded.");
  }, 30000);

  it("claims one PDF at a time and awaits durable execution", async () => {
    const job = { id: "pdf-job", job_type: "contract_pdf_extraction", status: "processing" };
    mocks.claim.mockResolvedValue([job]);
    let complete!: (value: unknown) => void;
    mocks.run.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    let finished = false;
    const pending = runPdfWorkerOnce("unique-process-id").then((result) => { finished = true; return result; });
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledWith({ job, workerId: "unique-process-id" }));
    expect(mocks.claim).toHaveBeenCalledWith({ workerId: "unique-process-id", jobTypes: ["contract_pdf_extraction"], limit: 1 });
    expect(finished).toBe(false);
    complete({ jobId: "pdf-job", status: "completed" });
    await expect(pending).resolves.toEqual({ jobId: "pdf-job", status: "completed" });
  });

  it("leaves queue rescue in charge when execution terminates unexpectedly", async () => {
    mocks.claim.mockResolvedValue([{ id: "pdf-job" }]);
    mocks.run.mockRejectedValue(new Error("connection lost"));
    await expect(runPdfWorkerOnce("first-incarnation")).rejects.toThrow("connection lost");
    mocks.claim.mockResolvedValue([]);
    await expect(runPdfWorkerOnce("restarted-incarnation")).resolves.toBeNull();
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
});
