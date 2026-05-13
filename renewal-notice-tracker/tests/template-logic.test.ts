import { describe, expect, it } from "vitest";
import {
  applyTemplateNoticeDeadline,
  isValidReminderOffset
} from "@/lib/contracts/templates";

describe("template helpers", () => {
  it("validates reminder offsets", () => {
    expect(isValidReminderOffset("-P45D")).toBe(true);
    expect(isValidReminderOffset("P2W")).toBe(true);
    expect(isValidReminderOffset("P15M")).toBe(true);
    expect(isValidReminderOffset("30D")).toBe(false);
    expect(isValidReminderOffset("P-30D")).toBe(false);
  });

  it("derives notice deadlines from template defaults", () => {
    const deadline = applyTemplateNoticeDeadline("2026-04-30T00:00:00.000Z", 30, "days");
    expect(deadline?.slice(0, 10)).toBe("2026-03-31");
  });
});
