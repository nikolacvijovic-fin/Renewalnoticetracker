import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

describe("Wave 3 production runtime health", () => {
  it("makes reminder-worker health depend on a fresh polling-loop heartbeat", () => {
    const compose = read("compose.production.yml");
    const worker = read("services", "go-worker", "cmd", "worker", "main.go");
    const health = read("services", "go-worker", "internal", "health", "health.go");

    expect(compose).toContain("NOTICECONTROL_WORKER_HEARTBEAT_FILE");
    expect(compose).toContain("NOTICECONTROL_WORKER_HEARTBEAT_MAX_AGE_SECONDS");
    expect(compose).toContain('["CMD", "/usr/local/bin/noticecontrol-worker", "--health"]');
    expect(worker).toContain("health.CheckHeartbeat");
    expect(worker).toContain("reminder_worker_heartbeat_unhealthy");
    expect(worker).toContain("reminder_worker_heartbeat_write_failed");
    expect(health).toContain("heartbeat_stale");
    expect(health).toContain("heartbeat_unavailable");
  });
});
