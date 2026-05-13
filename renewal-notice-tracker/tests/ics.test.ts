import { describe, expect, it } from "vitest";
import { buildCalendar } from "@/lib/contracts/ics";

describe("buildCalendar", () => {
  it("creates a valid VCALENDAR payload", () => {
    const value = buildCalendar([
      {
        uid: "abc",
        start: "2026-12-01T00:00:00.000Z",
        summary: "Reminder",
        description: "Check contract"
      }
    ]);

    expect(value).toContain("BEGIN:VCALENDAR");
    expect(value).toContain("BEGIN:VEVENT");
    expect(value).toContain("SUMMARY:Reminder");
  });
});
