import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationActivationState } from "@/lib/onboarding/activation-state";

export const ORGANIZATION_ACTIVATION_EVENT_TYPES = [
  "onboarding_started",
  "first_contract_imported",
  "first_owner_assigned",
  "first_notice_deadline_reviewed",
  "first_evidence_reviewed",
  "trust_exception_requested",
  "trust_exception_approved",
  "first_trusted_reminder_activated",
  "organization_activated"
] as const;

export type OrganizationActivationEventType =
  (typeof ORGANIZATION_ACTIVATION_EVENT_TYPES)[number];

export function deriveActivationMilestoneEvents(
  state: OrganizationActivationState
): OrganizationActivationEventType[] {
  const events: OrganizationActivationEventType[] = ["onboarding_started"];

  if (state.completedSteps.includes("contracts_imported")) events.push("first_contract_imported");
  if (state.completedSteps.includes("owner_assigned")) events.push("first_owner_assigned");
  if (state.completedSteps.includes("notice_deadline_confirmed")) {
    events.push("first_notice_deadline_reviewed");
  }
  if (state.completedSteps.includes("evidence_reviewed")) events.push("first_evidence_reviewed");
  if (state.currentState === "exception_approval_pending") events.push("trust_exception_requested");
  if (state.hasActiveTrustExceptionApproval) events.push("trust_exception_approved");
  if (state.hasActiveTrustedReminder) events.push("first_trusted_reminder_activated");
  if (state.currentState === "activated") events.push("organization_activated");

  return Array.from(new Set(events));
}

export async function recordOrganizationActivationMilestonesOnce(input: {
  organizationId: string;
  actorUserId: string | null;
  state: OrganizationActivationState;
}) {
  const eventTypes = deriveActivationMilestoneEvents(input.state);
  if (eventTypes.length === 0) return;

  const supabase = createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("organization_activation_events")
    .select("event_type")
    .eq("organization_id", input.organizationId)
    .in("event_type", eventTypes);

  if (existingError) throw existingError;

  const existingTypes = new Set((existing ?? []).map((event) => event.event_type));
  const newEvents = eventTypes
    .filter((eventType) => !existingTypes.has(eventType))
    .map((eventType) => ({
      organization_id: input.organizationId,
      actor_user_id: input.actorUserId,
      event_type: eventType,
      contract_id: input.state.recommendedContractId,
      metadata: {
        activation_state: input.state.currentState,
        percent_complete: input.state.percentComplete,
        risk_level: input.state.riskLevel
      }
    }));

  if (newEvents.length === 0) return;

  const { error } = await supabase.from("organization_activation_events").insert(newEvents);
  if (error) throw error;
}
