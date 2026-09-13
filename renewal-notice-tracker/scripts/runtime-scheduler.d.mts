export type ScheduledRuntimeTask = {
  id: string;
  pathname: string;
  auth: "cron" | "worker";
  intervalEnv: string;
  defaultIntervalSeconds: number;
  minimumIntervalSeconds: number;
  intervalMs: number;
};

export type RuntimeSchedulerConfig = {
  appUrl: string;
  cronSecret: string;
  workerSigningSecret: string;
  workerId: string;
  requestTimeoutMs: number;
  maxConsecutiveFailures: number;
  failureRetryMs: number;
  heartbeatFile: string;
  tasks: ScheduledRuntimeTask[];
};

export const SCHEDULED_RUNTIME_TASKS: Omit<ScheduledRuntimeTask, "intervalMs">[];

export function getRuntimeSchedulerConfig(
  env?: Record<string, string | undefined>
): RuntimeSchedulerConfig;

export function createSignedWorkerHeaders(input: {
  method: string;
  pathname: string;
  body: string;
  workerId: string;
  secret: string;
  now?: Date;
}): Record<string, string>;

export function runScheduledRuntimeTask(
  task: ScheduledRuntimeTask,
  config: RuntimeSchedulerConfig,
  fetchImpl?: typeof fetch
): Promise<{ taskId: string; status: number }>;

export function runDueRuntimeTasks(input: {
  config: RuntimeSchedulerConfig;
  dueAt: Map<string, number>;
  now?: number;
  fetchImpl?: typeof fetch;
}): Promise<Array<{
  taskId: string;
  ok: boolean;
  status?: number;
  error?: string;
}>>;
