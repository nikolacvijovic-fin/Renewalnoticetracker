import fs from "node:fs";
import path from "node:path";
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

type OrganizationRow = {
  id: string;
  subscription_status?: string | null;
  billing_subscription_status?: string | null;
  billing_current_period_end?: string | null;
  subscription_current_period_end?: string | null;
  billing_provider?: string | null;
  plan_tier?: string | null;
};

function createAdminClientStub(input: {
  ledgerDuplicate?: boolean;
  customerLookupId?: string | null;
  subscriptionLookupId?: string | null;
  organizationState?: OrganizationRow;
}) {
  const updates = {
    organizations: [] as Array<Record<string, unknown>>,
    ledger: [] as Array<Record<string, unknown>>
  };

  return {
    updates,
    client: {
      from(table: string) {
        if (table === "billing_webhook_events") {
          return {
            insert(payload: Record<string, unknown>) {
              updates.ledger.push({ insert: payload });
              return {
                select() {
                  return {
                    async maybeSingle() {
                      if (input.ledgerDuplicate) {
                        return {
                          data: null,
                          error: { code: "23505", message: "duplicate" }
                        };
                      }

                      return {
                        data: { id: "ledger-1" },
                        error: null
                      };
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
                          return {
                            data: input.customerLookupId ? { id: input.customerLookupId } : null,
                            error: null
                          };
                        }
                        if (column === "billing_subscription_id") {
                          return {
                            data: input.subscriptionLookupId
                              ? { id: input.subscriptionLookupId }
                              : null,
                            error: null
                          };
                        }

                        return { data: null, error: null };
                      }
                    };
                  }

                  return {
                    async single() {
                      return {
                        data: input.organizationState ?? {
                          id: value,
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

        throw new Error(`Unexpected table: ${table}`);
      }
    }
  };
}

describe("billing service webhook persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("ignores duplicate webhook deliveries using the event ledger", async () => {
    const adminStub = createAdminClientStub({
      ledgerDuplicate: true,
      customerLookupId: "org-1"
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.client);

    const { persistBillingWebhookUpdate } = await import("@/lib/billing/service");
    const result = await persistBillingWebhookUpdate({
      provider: "paddle",
      eventType: "subscription.updated",
      eventKey: "evt_duplicate",
      raw: { id: "evt_duplicate" },
      organizationId: null,
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      planTier: "growth",
      planCode: "price_growth",
      priceId: "price_growth"
    });

    expect(result).toEqual({ updated: false, duplicate: true });
    expect(adminStub.updates.organizations).toHaveLength(0);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("keeps Paddle webhook idempotency enforced by a DB-level provider/event-key unique index", () => {
    const migrationDir = path.join(process.cwd(), "supabase", "migrations");
    const migrationSql = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => fs.readFileSync(path.join(migrationDir, file), "utf8"))
      .join("\n");

    expect(migrationSql).toContain("create table if not exists public.billing_webhook_events");
    expect(migrationSql).toMatch(
      /create unique index if not exists billing_webhook_events_provider_event_key_idx\s+on public\.billing_webhook_events\(provider,\s*event_key\)/i
    );
  });

  it("ignores out-of-order regressions from cancelled to active", async () => {
    const adminStub = createAdminClientStub({
      organizationState: {
        id: "org-1",
        subscription_status: "cancelled",
        billing_subscription_status: "cancelled",
        billing_current_period_end: "2099-01-01T00:00:00.000Z",
        subscription_current_period_end: "2099-01-01T00:00:00.000Z"
      }
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.client);

    const { persistBillingWebhookUpdate } = await import("@/lib/billing/service");
    const result = await persistBillingWebhookUpdate({
      provider: "paddle",
      eventType: "subscription.updated",
      eventKey: "evt_out_of_order",
      raw: { id: "evt_out_of_order" },
      organizationId: "org-1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: "2099-02-01T00:00:00.000Z",
      planTier: "growth",
      planCode: "price_growth",
      priceId: "price_growth"
    });

    expect(result).toEqual({
      updated: false,
      organizationId: "org-1",
      ignoredOutOfOrder: true
    });
    expect(adminStub.updates.organizations).toHaveLength(0);
    expect(adminStub.updates.ledger).toContainEqual(
      expect.objectContaining({
        update: expect.objectContaining({ status: "ignored_out_of_order" })
      })
    );
  });

  it("records checkout completion as a reconciled analytics event when webhook sync succeeds", async () => {
    const sensitiveMarker = "RAW_PADDLE_PROVIDER_PAYLOAD_SHOULD_NOT_LEAK";
    const adminStub = createAdminClientStub({
      organizationState: {
        id: "org-1",
        subscription_status: "inactive",
        billing_subscription_status: "inactive",
        billing_current_period_end: null,
        subscription_current_period_end: null
      }
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.client);

    const { persistBillingWebhookUpdate } = await import("@/lib/billing/service");
    await persistBillingWebhookUpdate({
      provider: "paddle",
      eventType: "subscription.created",
      eventKey: "evt_checkout_completed",
      raw: { id: "evt_checkout_completed", provider_payload: sensitiveMarker },
      organizationId: "org-1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: "2099-02-01T00:00:00.000Z",
      planTier: "growth",
      planCode: "price_growth",
      priceId: "price_growth"
    });

    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "checkout_completed",
        organizationId: "org-1",
        sourceOfTruth: "event_and_state"
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain(sensitiveMarker);
    expect(JSON.stringify(trackServerAnalyticsEvent.mock.calls)).not.toContain(sensitiveMarker);
    expect(JSON.stringify(adminStub.updates.ledger)).not.toContain(sensitiveMarker);
  });
});
