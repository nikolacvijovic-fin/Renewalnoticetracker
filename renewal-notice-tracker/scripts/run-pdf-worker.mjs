import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/pdf-worker.cjs", import.meta.url));
// Hard wall-clock bound below the queue's ten-minute lease, enforced outside
// extraction's event loop so a blocked parser cannot disable its watchdog.
const ATTEMPT_TIMEOUT_MS = 8 * 60_000;

function boundedInteger(key, fallback, minimum, maximum) {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    console.error(`${key} must be an integer between ${minimum} and ${maximum}.`);
    process.exit(1);
  }
  return value;
}

const pollIntervalMs = boundedInteger("PDF_WORKER_POLL_INTERVAL_MS", 5_000, 500, 60_000);
const maxConsecutiveFailures = boundedInteger("PDF_WORKER_MAX_CONSECUTIVE_FAILURES", 5, 1, 100);
const heartbeatFile = process.env.PDF_WORKER_HEARTBEAT_FILE ??
  path.join(os.tmpdir(), "noticecontrol-pdf-worker.heartbeat");
const checkOnly = process.argv.includes("--check");
let stopping = false;
let child;
let consecutiveFailures = 0;

function writeHeartbeat() {
  fs.writeFileSync(heartbeatFile, new Date().toISOString(), "utf8");
}

function stopChild() {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => { stopping = true; stopChild(); });
}

writeHeartbeat();
do {
  const exitCode = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, checkOnly ? [entry, "--check"] : [entry], {
      stdio: "inherit",
      detached: process.platform !== "win32"
    });
    const watchdog = setTimeout(stopChild, ATTEMPT_TIMEOUT_MS);
    child.once("error", (error) => { clearTimeout(watchdog); reject(error); });
    child.once("close", (code) => { clearTimeout(watchdog); child = undefined; resolve(code ?? 1); });
  });

  if (exitCode === 0) {
    consecutiveFailures = 0;
    writeHeartbeat();
  } else if (!stopping) {
    consecutiveFailures += 1;
    console.error(JSON.stringify({
      level: "error",
      event: "pdf_worker_attempt_failed",
      service: "pdf-worker",
      metadata: { exit_code: exitCode, consecutive_failures: consecutiveFailures },
      logged_at: new Date().toISOString()
    }));
  }

  if (checkOnly || process.argv.includes("--once")) {
    process.exitCode = exitCode;
    break;
  }
  if (consecutiveFailures >= maxConsecutiveFailures) {
    console.error(JSON.stringify({
      level: "error",
      event: "pdf_worker_failure_threshold_reached",
      service: "pdf-worker",
      metadata: { consecutive_failures: consecutiveFailures },
      logged_at: new Date().toISOString()
    }));
    process.exitCode = 1;
    break;
  }
  if (!stopping) {
    const backoffMultiplier = Math.min(2 ** consecutiveFailures, 12);
    await delay(Math.min(pollIntervalMs * backoffMultiplier, 60_000));
  }
} while (!stopping);
