import { describe, expect, it } from "vitest";
import {
  buildDeliveryKey,
  isTerminalAttempt,
  nextRetryForAttempt
} from "@/lib/notifications/policy";

describe("notification policy", () => {
  it("builds stable delivery keys", () => {
    expect(buildDeliveryKey(["r1", "email", "ops@example.com"])).toBe(
      "r1:email:ops@example.com"
    );
  });

  it("marks terminal attempts correctly", () => {
    expect(isTerminalAttempt(4, 4)).toBe(true);
    expect(isTerminalAttempt(3, 4)).toBe(false);
  });

  it("computes a retry timestamp", () => {
    expect(nextRetryForAttempt(1)).toContain("T");
  });
});
