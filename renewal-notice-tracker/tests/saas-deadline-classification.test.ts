import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({ from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order"]) query[method] = () => query;
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mock.rows[table] ?? [], error: null }).then(resolve);
    return query;
  } })
}));
import { getSaasOptOutClock } from "@/lib/saas/queries";

describe("historical SaaS deadline classification", () => {
  it.each([
    [true, false, "auto_renewal"],
    [false, true, "notice_only"]
  ] as const)("classifies the selected older window (auto renewal %s), regardless of newer term %s", async (olderAuto, newerAuto, expected) => {
    mock.rows = {
      saas_software_inventory: [{ id: "software", name: "Service", status: "active" }],
      saas_contract_terms: [
        { id: "new", software_id: "software", auto_renewal: newerAuto, created_at: "2030-02-01", notice_deadline_date: "2031-01-01" },
        { id: "old", software_id: "software", auto_renewal: olderAuto, created_at: "2030-01-01", notice_deadline_date: "2030-06-01" }
      ],
      saas_opt_out_windows: [
        { id: "new-window", software_id: "software", saas_term_id: "new", opt_out_deadline: "2031-01-01", deadline_classification: newerAuto ? "auto_renewal" : "notice_only" },
        { id: "old-window", software_id: "software", saas_term_id: "old", opt_out_deadline: "2030-06-01", deadline_classification: expected }
      ]
    };
    const clock = await getSaasOptOutClock("org");
    expect(clock.items[0]).toMatchObject({
      latestTerm: { id: "new" }, optOutWindow: { id: "old-window" },
      effectiveOptOutDeadline: "2030-06-01", deadlineClassification: expected
    });
    expect(clock.metrics[expected === "notice_only" ? "noticeOnlyDeadlineCount" : "autoRenewalDeadlineCount"]).toBe(1);
  });
});
