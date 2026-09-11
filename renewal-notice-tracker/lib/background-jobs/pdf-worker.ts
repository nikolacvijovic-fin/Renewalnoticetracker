import { claimBackgroundJobs } from "@/lib/background-jobs/job-queue";
import { runClaimedBackgroundJob } from "@/lib/background-jobs/job-runner";

// One claim per child process prevents jobs from waiting behind expensive work
// while their leases expire. Queue retries and dead-lettering remain canonical.
export async function runPdfWorkerOnce(workerId: string) {
  const jobs = await claimBackgroundJobs({ workerId, jobTypes: ["contract_pdf_extraction"], limit: 1 });
  const job = jobs[0];
  if (!job) return null;
  return runClaimedBackgroundJob({ job, workerId });
}
