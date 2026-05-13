import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createAuditLog = vi.fn();
const createAdminSupabaseClient = vi.fn();
const trackServerAnalyticsEvent = vi.fn();

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

function createReplayAwareAdminClient() {
  const seenEventKeys = new Set<string>();
  const updates = {
    organizations: [] as Array<Record<string, unknown>>,
    ledger: [] as Array<Record<string, unknown>>
  };

  const client = {
    from(table: string) {
      if (table === "billing_webhook_events") {
        return {
          insert(payload: Record<string, unknown>) {
            updates.ledger.push({ insert: payload });
            return {
              select() {
                return {
                  async maybeSingle() {
                    const eventKey = String(payload.event_key);
                    if (seenEventKeys.has(eventKey)) {
                      return {
                        data: null,
                        error: { code: "23505", message: "duplicate" }
                      };
                    }

                    seenEventKeys.add(eventKey);
                    return { data: { id: "ledger-1" }, error: null };
                  }
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            updates.ledger.push({ update: payload });
            return {
              eq() {
                return this;
              }
            };
          }
        };
      }

      if (table === "organizations") {
        return {
          select(selection: string) {
            return {
              eq(column: string, value: string) {
                if (selection === "id") {
                  return {
                    async maybeSingle() {
                      if (column === "billing_customer_id") {
                        return { data: value === "cus_paddle" ? { id: "org-1" } : null, error: null };
                      }

                      return { data: null, error: null };
                    }
                  };
                }

                return {
                  async single() {
                    return {
                      data: {
                        id: "org-1",
                        subscription_status: "inactive",
                        billing_subscription_status: "inactive",
                        billing_current_period_end: null,
                        subscription_current_period_end: null
                      },
                      error: null
                    };
                  }
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            updates.organizations.push(payload);
            return {
              eq() {
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };

  return { client, updates };
}

describe("billing webhook replay integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.PADDLE_WEBHOOK_SECRET = "paddle-secret";
    process.env.PADDLE_API_KEY = "paddle-key";
    process.env.PADDLE_ENVIRONMENT = "sandbox";
    process.env.PADDLE_STARTER_PRICE_ID = "price_starter";
    process.env.PADDLE_GROWTH_PRICE_ID = "price_growth";
  });

  it("treats a replayed realistic Paddle event as a duplicate after the first successful sync", async () => {
    const adminStub = createReplayAwareAdminClient();
    createAdminSupabaseClient.mockReturnValue(adminStub.client);

    const { handleWebhook } = await import("@/lib/billing/provider");
    const { persistBillingWebhookUpdate } = await import("@/lib/billing/service");

    const body = JSON.stringify({
      event_id: "evt_paddle_replay",
      event_type: "subscription.updated",
      data: {
        customer_id: "cus_paddle",
        subscription_id: "sub_paddle",
        items: [{ price_id: "price_growth" }],
        status: "active",
        current_billing_period: { ends_at: "2099-01-01T00:00:00.000Z" },
        custom_data: { organization_id: null }
      }
    });

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const signature = crypto
      .createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET ?? "")
      .update(`${timestamp}:${body}`)
      .digest("hex");

    const normalized = await handleWebhook("paddle", {
      body,
      headers: new Headers({
        "paddle-signature": `ts=${timestamp};h1=${signature}`
      })
    });

    const first = await persistBillingWebhookUpdate(normalized);
    const replay = await persistBillingWebhookUpdate(normalized);

    expect(first).toEqual({ updated: true, organizationId: "org-1" });
    expect(replay).toEqual({ updated: false, duplicate: true });
    expect(adminStub.updates.organizations).toHaveLength(1);
    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "checkout_completed",
        organizationId: "org-1"
      })
    );
  });
});
