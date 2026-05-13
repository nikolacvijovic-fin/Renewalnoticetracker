import { resendNotificationAction, rerunReminderAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export type InternalBillingSummary = {
  providerLabel: string;
  planTier: string;
  status: string;
  currentPeriodEnd: string | null;
  issues: string[];
};

export type InternalPrivacyTraceSummary = {
  exportRequests30d: number;
  openDeletionRequests: number;
  latestExportAt: string | null;
  latestDeletionRequestAt: string | null;
  latestBackupCheckAt: string | null;
  latestBackupStatus: string | null;
  latestRestoreTestedAt: string | null;
  blockers: string[];
  warnings: string[];
};

type Snapshot = {
  totalContracts: number;
  totalReminders: number;
  sentLast7Days: number;
  sentLast30Days: number;
  failedReminders: number;
  retryPendingReminders: number;
  processingReminders: number;
  cancelledReminders: number;
  failedNotifications: number;
  duplicateSuppressedNotifications: number;
  contractsNeedingReview: number;
  extractionFailureCount: number;
  retryScheduledRuns: number;
  terminalFailureRuns: number;
  topReminderStatuses: Array<[string, number]>;
};

type DebugData = {
  failedReminders: Array<{
    id: string;
    contract_id: string;
    status: string;
    last_error: string | null;
    attempt_count: number;
    next_retry_at: string | null;
    created_at?: string | null;
  }>;
  notificationLogs: Array<{
    id: string;
    reminder_id: string | null;
    channel: string;
    status: string;
    recipient_email: string;
    destination: string | null;
    error_message: string | null;
    sent_at: string | null;
  }>;
  extractionFailures: Array<{
    id: string;
    contract_id: string;
    stage: string;
    error_message: string;
    created_at: string;
  }>;
  reminderRuns: Array<{
    id: string;
    reminder_id: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
  importJobs: Array<{
    id: string;
    file_name: string;
    status: string;
    error_message: string | null;
    created_at: string;
    row_count: number;
    imported_count: number;
  }>;
};

export function AdminPanel({
  organizationId,
  snapshot,
  debug,
  billing,
  privacyTraces
}: {
  organizationId: string;
  snapshot: Snapshot;
  debug: DebugData;
  billing: InternalBillingSummary;
  privacyTraces: InternalPrivacyTraceSummary | null;
}) {
  const importsNeedingRescue = debug.importJobs.filter(
    (job) => job.status === "failed" || job.status === "completed_with_errors"
  ).length;

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <h2 className="text-lg font-semibold">Operational overview</h2>
        <p className="mt-1 text-sm text-slate-500">
          Internal-only rescue console for reminder delivery, extraction failures, import issues,
          billing exceptions, and audit-safe support actions.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Needs review" value={snapshot.contractsNeedingReview} />
          <Metric label="Retry pending" value={snapshot.retryPendingReminders} />
          <Metric label="Failed reminders" value={snapshot.failedReminders} />
          <Metric label="Failed notifications" value={snapshot.failedNotifications} />
          <Metric label="Duplicate suppressed" value={snapshot.duplicateSuppressedNotifications} />
          <Metric label="Extraction failures" value={snapshot.extractionFailureCount} />
          <Metric label="Retry runs" value={snapshot.retryScheduledRuns} />
          <Metric label="Imports needing rescue" value={importsNeedingRescue} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Reminder delivery health</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {snapshot.topReminderStatuses.length > 0 ? (
              snapshot.topReminderStatuses.map(([status, count]) => (
                <div key={status} className="flex justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <span>{status}</span>
                  <span>{count}</span>
                </div>
              ))
            ) : (
              <p>No reminder status data recorded.</p>
            )}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Billing exceptions</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-ink">{billing.providerLabel}</p>
              <p className="mt-1">
                Plan: {billing.planTier} • Status: {billing.status}
              </p>
              <p className="mt-1">Current period end: {billing.currentPeriodEnd ?? "not set"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium text-ink">Support follow-up</p>
              <ul className="mt-3 space-y-2">
                {billing.issues.length > 0 ? (
                  billing.issues.map((issue) => <li key={issue}>- {issue}</li>)
                ) : (
                  <li>No active billing exceptions.</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Failed reminder jobs</h2>
          <div className="mt-4 space-y-4">
            {debug.failedReminders.length > 0 ? (
              debug.failedReminders.map((reminder) => (
                <div key={reminder.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium">{reminder.status}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Attempts: {reminder.attempt_count} • Next retry: {reminder.next_retry_at ?? "none"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{reminder.last_error ?? "No error"}</p>
                  <ServerActionForm serverAction={rerunReminderAction} className="mt-3">
                    <input type="hidden" name="organization_id" value={organizationId} />
                    <input type="hidden" name="reminder_id" value={reminder.id} />
                    <Button type="submit" variant="secondary">
                      Rerun reminder
                    </Button>
                  </ServerActionForm>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No failed reminder jobs.</p>
            )}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Recent notification attempts</h2>
          <div className="mt-4 space-y-4">
            {debug.notificationLogs.length > 0 ? (
              debug.notificationLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium">
                    {log.channel} • {log.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {log.recipient_email} • {log.destination ?? "no destination"}
                  </p>
                  {log.error_message ? (
                    <p className="mt-2 text-sm text-slate-600">{log.error_message}</p>
                  ) : null}
                  {log.status === "failed" ? (
                    <ServerActionForm serverAction={resendNotificationAction} className="mt-3">
                      <input type="hidden" name="organization_id" value={organizationId} />
                      <input type="hidden" name="notification_log_id" value={log.id} />
                      <Button type="submit" variant="secondary">
                        Resend notification
                      </Button>
                    </ServerActionForm>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No notification attempts recorded.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Extraction failures</h2>
          <div className="mt-4 space-y-4">
            {debug.extractionFailures.length > 0 ? (
              debug.extractionFailures.map((failure) => (
                <div key={failure.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium">{failure.stage.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatTimestamp(failure.created_at)}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{failure.error_message}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No extraction failures recorded.</p>
            )}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Recent import jobs</h2>
          <div className="mt-4 space-y-4">
            {debug.importJobs.length > 0 ? (
              debug.importJobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium">
                    {job.file_name} • {job.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Imported {job.imported_count}/{job.row_count} rows • {formatTimestamp(job.created_at)}
                  </p>
                  {job.error_message ? (
                    <p className="mt-2 text-sm text-slate-600">{job.error_message}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No import jobs recorded.</p>
            )}
          </div>
        </section>
      </div>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">Recent reminder lifecycle events</h2>
        <div className="mt-4 space-y-4">
          {debug.reminderRuns.length > 0 ? (
            debug.reminderRuns.map((run) => (
              <div key={run.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-medium">{run.status}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Reminder {run.reminder_id} • {formatTimestamp(run.created_at)}
                </p>
                {run.error_message ? (
                  <p className="mt-2 text-sm text-slate-600">{run.error_message}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No reminder lifecycle events recorded.</p>
          )}
        </div>
      </section>

      {privacyTraces ? (
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Operational traces</h2>
          <p className="mt-1 text-sm text-slate-500">
            Export, deletion, backup, and restore traces that affect real support operations.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric label="Export requests / 30d" value={privacyTraces.exportRequests30d} />
            <Metric label="Open deletion requests" value={privacyTraces.openDeletionRequests} />
            <Metric label="Latest export" value={privacyTraces.latestExportAt ?? "none"} />
            <Metric label="Latest backup check" value={privacyTraces.latestBackupCheckAt ?? "missing"} />
            <Metric label="Latest restore test" value={privacyTraces.latestRestoreTestedAt ?? "missing"} />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <TraceList title="Blockers" items={privacyTraces.blockers} empty="No active operational blockers." />
            <TraceList title="Warnings" items={privacyTraces.warnings} empty="No active operational warnings." />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-ink break-words">{value}</p>
    </div>
  );
}

function TraceList({
  title,
  items,
  empty
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {items.length > 0 ? items.map((item) => <li key={item}>- {item}</li>) : <li>{empty}</li>}
      </ul>
    </div>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toUTCString();
}
