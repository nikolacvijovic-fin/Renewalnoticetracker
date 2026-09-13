import fs from "node:fs";

async function checkWebReadiness() {
  const appUrl = process.env.NOTICECONTROL_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.INTERNAL_HEALTH_SECRET;
  if (!appUrl || !secret) throw new Error("Web readiness configuration is incomplete.");
  const response = await fetch(new URL("/api/internal/health?readiness=1", appUrl), {
    headers: { "x-internal-health-secret": secret },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`Web readiness returned HTTP ${response.status}.`);
  const body = await response.json();
  if (body?.ok !== true || body?.mode !== "readiness") throw new Error("Web readiness response was invalid.");
}

function checkHeartbeat() {
  const file = process.env.RUNTIME_HEARTBEAT_FILE;
  const maximumAgeSeconds = Number(process.env.RUNTIME_HEARTBEAT_MAX_AGE_SECONDS ?? "600");
  if (!file || !Number.isFinite(maximumAgeSeconds) || maximumAgeSeconds < 1) {
    throw new Error("Heartbeat health configuration is incomplete.");
  }
  const ageMs = Date.now() - fs.statSync(file).mtimeMs;
  if (ageMs > maximumAgeSeconds * 1_000) throw new Error("Runtime heartbeat is stale.");
}

try {
  if (process.argv[2] === "web") await checkWebReadiness();
  else if (process.argv[2] === "heartbeat") checkHeartbeat();
  else throw new Error("Unknown runtime health mode.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Runtime health check failed.");
  process.exit(1);
}
