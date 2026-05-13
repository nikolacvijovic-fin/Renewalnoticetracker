import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { Phase1AnalyticsEventName } from "@/lib/analytics/phase1-events";

export async function trackServerAnalyticsEvent(input: {
  organizationId?: string | null;
  actorUserId?: string | null;
  eventName: Phase1AnalyticsEventName;
  sourceOfTruth: "event" | "state" | "event_and_state";
  idempotencyKey?: string | null;
  properties?: Json;
}) {
  const admin = createAdminSupabaseClient();
  const payload = {
    organization_id: input.organizationId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_name: input.eventName,
    source_kind: "server",
    source_of_truth: input.sourceOfTruth,
    idempotency_key: input.idempotencyKey ?? null,
    properties: input.properties ?? {}
  };

  const { error } = await admin.from("analytics_events").insert(payload);
  if (error?.code === "23505") {
    return { inserted: false as const };
  }
  if (error) throw error;

  return { inserted: true as const };
}
