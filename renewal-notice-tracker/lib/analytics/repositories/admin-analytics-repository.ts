import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { Phase1AnalyticsEventName } from "@/lib/analytics/phase1-events";

export type AdminAnalyticsEventInsert = {
  organizationId?: string | null;
  actorUserId?: string | null;
  eventName: Phase1AnalyticsEventName;
  sourceOfTruth: "event" | "state" | "event_and_state";
  idempotencyKey?: string | null;
  properties?: Json;
};

export async function insertServerAnalyticsEvent(input: AdminAnalyticsEventInsert) {
  const admin = createAdminSupabaseClient();
  return admin.from("analytics_events").insert({
    organization_id: input.organizationId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_name: input.eventName,
    source_kind: "server",
    source_of_truth: input.sourceOfTruth,
    idempotency_key: input.idempotencyKey ?? null,
    properties: input.properties ?? {}
  });
}
