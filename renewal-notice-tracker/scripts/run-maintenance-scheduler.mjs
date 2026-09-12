import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { getRuntimeSchedulerConfig, runDueRuntimeTasks } from "./runtime-scheduler.mjs";

function log(level, event, metadata = {}) {
  console[level](JSON.stringify({
    level,
    event,
    service: "maintenance-scheduler",
    metadata,
    logged_at: new Date().toISOString()
  }));
}

function writeHeartbeat(file) {
  fs.writeFileSync(file, new Date().toISOString(), "utf8");
}

let config;
try {
  config = getRuntimeSchedulerConfig();
} catch (error) {
  log("error", "scheduler_config_invalid", {
    message: error instanceof Error ? error.message : "Scheduler configuration is invalid."
  });
  process.exit(1);
}

const once = process.argv.includes("--once");
const dueAt = new Map();
let stopping = false;
let consecutiveFailures = 0;
const unhealthyTasks = new Set();
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => { stopping = true; });
}

writeHeartbeat(config.heartbeatFile);
do {
  const results = await runDueRuntimeTasks({ config, dueAt });
  const failures = results.filter((result) => !result.ok);
  for (const result of results) {
    if (result.ok) unhealthyTasks.delete(result.taskId);
    else unhealthyTasks.add(result.taskId);
    log(result.ok ? "info" : "error", result.ok ? "scheduler_task_succeeded" : "scheduler_task_failed", {
      task_id: result.taskId,
      status: result.status ?? null,
      error: result.ok ? null : result.error
    });
  }

  if (results.length === 0) {
    if (unhealthyTasks.size === 0) writeHeartbeat(config.heartbeatFile);
  } else if (failures.length === 0 && unhealthyTasks.size === 0) {
    consecutiveFailures = 0;
    writeHeartbeat(config.heartbeatFile);
  } else if (failures.length > 0) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= config.maxConsecutiveFailures) {
      log("error", "scheduler_failure_threshold_reached", {
        consecutive_failures: consecutiveFailures,
        failed_task_count: failures.length,
        unhealthy_task_count: unhealthyTasks.size
      });
      process.exitCode = 1;
      break;
    }
  }

  if (once) {
    process.exitCode = failures.length === 0 ? 0 : 1;
    break;
  }
  if (!stopping) await delay(1_000);
} while (!stopping);
