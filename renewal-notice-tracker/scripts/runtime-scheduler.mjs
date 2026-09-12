import { createHash, createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";

export const SCHEDULED_RUNTIME_TASKS = [
  {
    id: "reminder-dispatch",
    pathname: "/api/cron/send-reminders",
    auth: "cron",
    intervalEnv: "SCHEDULER_REMINDER_INTERVAL_SECONDS",
    defaultIntervalSeconds: 60,
    minimumIntervalSeconds: 15
  },
  {
    id: "subscription-usage-sync",
    pathname: "/api/cron/subscription-usage-sync",
    auth: "cron",
    intervalEnv: "SCHEDULER_SUBSCRIPTION_USAGE_INTERVAL_SECONDS",
    defaultIntervalSeconds: 900,
    minimumIntervalSeconds: 60
  },
  {
    id: "stale-pdf-upload-cleanup",
    pathname: "/api/internal/pdf-upload-attempts/cleanup",
    auth: "worker",
    intervalEnv: "SCHEDULER_PDF_CLEANUP_INTERVAL_SECONDS",
    defaultIntervalSeconds: 86_400,
    minimumIntervalSeconds: 3_600
  }
];

function boundedInteger(env, key, fallback, minimum, maximum) {
  const raw = env[key];
  if (raw == null || String(raw).trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function getRuntimeSchedulerConfig(env = process.env) {
  const appUrl = String(env.NOTICECONTROL_APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const cronSecret = String(env.CRON_SHARED_SECRET ?? "").trim();
  const workerSigningSecret = String(env.ADD_ON_INTERNAL_SIGNING_SECRET ?? "").trim();
  if (!appUrl) throw new Error("NOTICECONTROL_APP_URL or NEXT_PUBLIC_APP_URL is required.");
  let parsedUrl;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new Error("NOTICECONTROL_APP_URL must be a valid URL.");
  }
  if (!cronSecret) throw new Error("CRON_SHARED_SECRET is required.");
  if (!workerSigningSecret) throw new Error("ADD_ON_INTERNAL_SIGNING_SECRET is required.");

  const workerId = String(env.NOTICECONTROL_SCHEDULER_ID ?? "noticecontrol-maintenance-scheduler").trim();
  if (!workerId) throw new Error("NOTICECONTROL_SCHEDULER_ID must not be empty.");

  return {
    appUrl: parsedUrl.toString(),
    cronSecret,
    workerSigningSecret,
    workerId,
    requestTimeoutMs: boundedInteger(env, "SCHEDULER_REQUEST_TIMEOUT_MS", 10_000, 1_000, 60_000),
    maxConsecutiveFailures: boundedInteger(env, "SCHEDULER_MAX_CONSECUTIVE_FAILURES", 5, 1, 100),
    failureRetryMs: boundedInteger(env, "SCHEDULER_FAILURE_RETRY_SECONDS", 60, 5, 3_600) * 1_000,
    heartbeatFile: String(
      env.SCHEDULER_HEARTBEAT_FILE ?? path.join(os.tmpdir(), "noticecontrol-scheduler.heartbeat")
    ),
    tasks: SCHEDULED_RUNTIME_TASKS.map((task) => ({
      ...task,
      intervalMs: boundedInteger(
        env,
        task.intervalEnv,
        task.defaultIntervalSeconds,
        task.minimumIntervalSeconds,
        604_800
      ) * 1_000
    }))
  };
}

export function createSignedWorkerHeaders({ method, pathname, body, workerId, secret, now = new Date() }) {
  const timestamp = now.toISOString();
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  const payload = [method.toUpperCase(), pathname, timestamp, bodySha256].join("\n");
  const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  return {
    "x-noticecontrol-worker-id": workerId,
    "x-noticecontrol-timestamp": timestamp,
    "x-noticecontrol-body-sha256": bodySha256,
    "x-noticecontrol-signature": signature
  };
}

export async function runScheduledRuntimeTask(task, config, fetchImpl = fetch) {
  const body = "";
  const headers = task.auth === "cron"
    ? { "x-cron-secret": config.cronSecret }
    : createSignedWorkerHeaders({
        method: "POST",
        pathname: task.pathname,
        body,
        workerId: config.workerId,
        secret: config.workerSigningSecret
      });
  const response = await fetchImpl(new URL(task.pathname, config.appUrl), {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  });
  if (!response.ok) {
    throw new Error(`${task.id} returned HTTP ${response.status}.`);
  }
  return { taskId: task.id, status: response.status };
}

export async function runDueRuntimeTasks({ config, dueAt, now = Date.now(), fetchImpl = fetch }) {
  const dueTasks = config.tasks.filter((task) => (dueAt.get(task.id) ?? 0) <= now);
  const results = [];
  for (const task of dueTasks) {
    try {
      const result = await runScheduledRuntimeTask(task, config, fetchImpl);
      results.push({ ...result, ok: true });
    } catch (error) {
      results.push({
        taskId: task.id,
        ok: false,
        error: error instanceof Error ? error.message : "Scheduled task failed."
      });
    } finally {
      const failed = results.at(-1)?.taskId === task.id && results.at(-1)?.ok === false;
      dueAt.set(task.id, now + (failed ? config.failureRetryMs : task.intervalMs));
    }
  }
  return results;
}
