import type { Json } from "@/lib/supabase/database.types";
import type { Phase1AnalyticsEventName } from "@/lib/analytics/phase1-events";
import { insertServerAnalyticsEvent } from "@/lib/analytics/repositories/admin-analytics-repository";

export async function trackServerAnalyticsEvent(input: {
  organizationId?: string | null;
  actorUserId?: string | null;
  eventName: Phase1AnalyticsEventName;
  sourceOfTruth: "event" | "state" | "event_and_state";
  idempotencyKey?: string | null;
  properties?: Json;
}) {
  const { error } = await insertServerAnalyticsEvent(input);
  if (error?.code === "23505") {
    return { inserted: false as const };
  }
  if (error) throw error;

  return { inserted: true as const };
}
