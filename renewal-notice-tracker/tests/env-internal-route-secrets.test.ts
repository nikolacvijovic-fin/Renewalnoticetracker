import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("env validation for internal route secrets", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("fails loudly when the OCR internal secret is missing", async () => {
    delete process.env.INTERNAL_OCR_JOBS_SECRET;
    vi.resetModules();

    await expect(import("@/lib/env")).rejects.toThrow(/INTERNAL_OCR_JOBS_SECRET/i);
  });

  it("fails loudly when the destructive signing secret is missing", async () => {
    delete process.env.INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET;
    vi.resetModules();

    await expect(import("@/lib/env")).rejects.toThrow(/INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET/i);
  });
});
