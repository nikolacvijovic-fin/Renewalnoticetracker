import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/pdf-worker.cjs", import.meta.url));
// Hard wall-clock bound below the queue's ten-minute lease, enforced outside
// extraction's event loop so a blocked parser cannot disable its watchdog.
const ATTEMPT_TIMEOUT_MS = 8 * 60_000;
let stopping = false;
let child;
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

do {
  const exitCode = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [entry], {
      stdio: "inherit",
      detached: process.platform !== "win32"
    });
    const watchdog = setTimeout(stopChild, ATTEMPT_TIMEOUT_MS);
    child.once("error", (error) => { clearTimeout(watchdog); reject(error); });
    child.once("close", (code) => { clearTimeout(watchdog); child = undefined; resolve(code ?? 1); });
  });
  if (process.argv.includes("--once")) {
    process.exitCode = exitCode;
    break;
  }
  if (!stopping) await delay(5000);
} while (!stopping);
