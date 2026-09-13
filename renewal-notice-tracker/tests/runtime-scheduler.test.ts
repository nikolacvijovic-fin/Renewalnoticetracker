import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createSignedWorkerHeaders,
  getRuntimeSchedulerConfig,
  runDueRuntimeTasks
} from "@/scripts/runtime-scheduler.mjs";

function schedulerEnv(overrides: Record<string, string> = {}) {
  return {
    NOTICECONTROL_APP_URL: "https://app.noticecontrol.test",
    CRON_SHARED_SECRET: "cron-secret",
    ADD_ON_INTERNAL_SIGNING_SECRET: "worker-secret",
    ...overrides
  };
}

describe("maintenance runtime scheduler", () => {
  it("validates scheduler identity and interval bounds", () => {
    expect(() => getRuntimeSchedulerConfig(schedulerEnv({ NOTICECONTROL_SCHEDULER_ID: " " }))).toThrow(
      "NOTICECONTROL_SCHEDULER_ID"
    );
    expect(() => getRuntimeSchedulerConfig(schedulerEnv({ SCHEDULER_FAILURE_RETRY_SECONDS: "1" }))).toThrow(
      "SCHEDULER_FAILURE_RETRY_SECONDS"
    );
  });

  it("signs cleanup requests over the exact method, path, timestamp, and body", () => {
    const now = new Date("2026-09-12T10:00:00.000Z");
    const headers = createSignedWorkerHeaders({
      method: "POST",
      pathname: "/api/internal/pdf-upload-attempts/cleanup",
      body: "",
      workerId: "scheduler-1",
      secret: "worker-secret",
      now
    });
    const digest = createHash("sha256").update("").digest("hex");
    const expected = createHmac("sha256", "worker-secret")
      .update(`POST\n/api/internal/pdf-upload-attempts/cleanup\n${now.toISOString()}\n${digest}`)
      .digest("hex");

    expect(headers).toMatchObject({
      "x-noticecontrol-worker-id": "scheduler-1",
      "x-noticecontrol-timestamp": now.toISOString(),
      "x-noticecontrol-body-sha256": digest,
      "x-noticecontrol-signature": `sha256=${expected}`
    });
  });

  it("retries failed tasks on the bounded retry interval without delaying successful tasks", async () => {
    const config = getRuntimeSchedulerConfig(schedulerEnv({ SCHEDULER_FAILURE_RETRY_SECONDS: "30" }));
    const dueAt = new Map<string, number>();
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      return new Response(null, { status: url.pathname.includes("cleanup") ? 503 : 200 });
    });
    const now = Date.parse("2026-09-12T10:00:00.000Z");

    const results = await runDueRuntimeTasks({ config, dueAt, now, fetchImpl });

    expect(results).toHaveLength(3);
    expect(results.find((result) => result.taskId === "stale-pdf-upload-cleanup")?.ok).toBe(false);
    expect(dueAt.get("stale-pdf-upload-cleanup")).toBe(now + 30_000);
    expect(dueAt.get("reminder-dispatch")).toBe(now + 60_000);
    expect(dueAt.get("subscription-usage-sync")).toBe(now + 900_000);
  });
});
