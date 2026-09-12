import { requireInternalRole } from "@/lib/internal-access";
import { getAdminBackgroundJobHealthSnapshot } from "@/lib/background-jobs/repositories/admin-background-jobs-repository";

function ageMinutes(value: string | null) {
  if (!value) return null;
  const started = new Date(value).getTime();
  if (!Number.isFinite(started)) return null;
  return Math.max(0, Math.round((Date.now() - started) / 60000));
}

export default async function AdminBackgroundJobsPage({
  searchParams
}: {
  searchParams?: Promise<{ organizationId?: string }>;
}) {
  await requireInternalRole(["internal_support", "internal_admin"]);
  const resolvedSearchParams = await searchParams;
  const organizationId = resolvedSearchParams?.organizationId?.trim() ?? "";

  if (!organizationId) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold">Background Jobs</h1>
        <p className="text-slate-500">Add an explicit organizationId query parameter to view job health.</p>
      </section>
    );
  }

  const snapshot = await getAdminBackgroundJobHealthSnapshot({ organizationId });
  if (snapshot.jobs.error) throw snapshot.jobs.error;
  if (snapshot.attempts.error) throw snapshot.attempts.error;
  const jobs = snapshot.jobs.data ?? [];
  const attempts = snapshot.attempts.data ?? [];
  const counts = jobs.reduce<Record<string, number>>((nextCounts, job) => {
    nextCounts[job.status] = (nextCounts[job.status] ?? 0) + 1;
    return nextCounts;
  }, {});
  const oldestQueued = jobs
    .filter((job) => job.status === "queued" || job.status === "retry_scheduled")
    .map((job) => ageMinutes(job.created_at))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0] ?? null;
  const trustedReminderAttempts = attempts.filter((attempt) =>
    jobs.some((job) => job.id === attempt.job_id && job.job_type === "trusted_reminder_delivery")
  );
  const failedTrustedReminderAttempts = trustedReminderAttempts.filter((attempt) =>
    ["failed", "dead_lettered", "retry_scheduled"].includes(attempt.status)
  );
  const failureRate =
    trustedReminderAttempts.length > 0
      ? Math.round((failedTrustedReminderAttempts.length / trustedReminderAttempts.length) * 100)
      : 0;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Background Jobs</h1>
        <p className="mt-2 text-slate-500">
          Internal-only delivery health for trusted reminders, imports, audit flushes, webhooks, and add-on jobs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Queued", counts.queued ?? 0],
          ["Processing", counts.processing ?? 0],
          ["Retry scheduled", counts.retry_scheduled ?? 0],
          ["Dead-lettered", counts.dead_lettered ?? 0]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Trusted reminder delivery</h2>
        <p className="mt-2 text-sm text-slate-500">
          Failure rate: {failureRate}% · Oldest queued age: {oldestQueued ?? 0} minutes · Signed worker routes own
          retry, completion, failure, and cancellation transitions; admin cancellation remains an explicit audited
          operator action, not a broad dashboard shortcut.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Recent attempts</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {attempts.slice(0, 10).map((attempt) => (
            <div key={attempt.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-950">{attempt.status}</span>
                <span className="text-slate-500">{attempt.error_code ?? "no_error"}</span>
              </div>
              <p className="mt-1 text-slate-500">
                job {attempt.job_id} · worker {attempt.worker_id} · attempt {attempt.attempt_number}
              </p>
            </div>
          ))}
          {attempts.length === 0 ? <p className="text-sm text-slate-500">No attempts recorded yet.</p> : null}
        </div>
      </div>
    </section>
  );
}
