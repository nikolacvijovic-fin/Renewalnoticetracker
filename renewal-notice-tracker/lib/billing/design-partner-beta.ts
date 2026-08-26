import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DesignPartnerBetaControl = {
  organizationId: string;
  status: "pending" | "active" | "grace" | "read_only" | "ended";
  maximumContracts: number;
  maximumProviderConnections: number;
  maximumUserSeats: number;
  allowedProviders: Array<"microsoft_365" | "google_workspace">;
  expiresAt: string | null;
  graceEndsAt: string | null;
  founderApprovedAt: string | null;
};

export const DESIGN_PARTNER_BETA_MUTATIONS = [
  "upload_contract", "edit_contract", "review_contract", "connect_provider", "sync_provider", "create_findings",
  "create_decision", "update_decision", "create_scenario", "select_scenario", "create_task", "update_task",
  "upload_quote", "review_quote", "create_approval", "approve_decision", "create_negotiation_draft",
  "update_negotiation_draft", "confirm_outcome", "invite_member", "change_member_role"
] as const;

export type DesignPartnerBetaMutation = (typeof DESIGN_PARTNER_BETA_MUTATIONS)[number];

export function evaluateDesignPartnerBetaMutation(input: {
  control: DesignPartnerBetaControl | null;
  action: DesignPartnerBetaMutation;
  now?: Date;
  currentContracts?: number;
  currentProviderConnections?: number;
  currentUserSeats?: number;
  provider?: "microsoft_365" | "google_workspace";
}) {
  const control = input.control;
  if (!control) return { allowed: true as const, reason: "not_design_partner_beta" as const, message: "Standard billing controls apply." };
  const now = input.now ?? new Date();
  const expiresAt = control.expiresAt ? new Date(control.expiresAt) : null;
  const graceEndsAt = control.graceEndsAt ? new Date(control.graceEndsAt) : null;
  const expired = Boolean(expiresAt && expiresAt <= now);
  const graceExpired = Boolean(graceEndsAt && graceEndsAt <= now);

  if (!control.founderApprovedAt || control.status === "pending") {
    return { allowed: false as const, reason: "founder_activation_required" as const, message: "Design Partner Beta activation is pending founder approval." };
  }
  if (control.status === "read_only" || control.status === "ended" || (expired && (!graceEndsAt || graceExpired))) {
    return { allowed: false as const, reason: "beta_read_only" as const, message: "The Design Partner Beta period has ended. Existing evidence remains available; contact the founder to continue." };
  }
  if (expired || control.status === "grace") {
    return { allowed: false as const, reason: "beta_grace_read_only" as const, message: "The Design Partner Beta is in its grace period. Existing evidence remains available, but new uploads and synchronization are paused." };
  }
  if (input.action === "upload_contract" && (input.currentContracts ?? 0) >= control.maximumContracts) {
    return { allowed: false as const, reason: "contract_limit_reached" as const, message: `The Design Partner Beta contract limit of ${control.maximumContracts} has been reached.` };
  }
  if (input.action === "connect_provider") {
    if (input.provider && !control.allowedProviders.includes(input.provider)) {
      return { allowed: false as const, reason: "provider_not_allowed" as const, message: "This provider is not enabled for the Design Partner Beta." };
    }
    if ((input.currentProviderConnections ?? 0) >= control.maximumProviderConnections) {
      return { allowed: false as const, reason: "provider_limit_reached" as const, message: "The Design Partner Beta provider connection limit has been reached." };
    }
  }
  if (input.action === "invite_member" && (input.currentUserSeats ?? 0) >= control.maximumUserSeats) {
    return { allowed: false as const, reason: "user_seat_limit_reached" as const, message: `The Design Partner Beta user-seat limit of ${control.maximumUserSeats} has been reached.` };
  }
  return { allowed: true as const, reason: "allowed" as const, message: "Design Partner Beta access is active." };
}

export async function getDesignPartnerBetaControl(organizationId: string): Promise<DesignPartnerBetaControl | null> {
  const { data, error } = await createServerSupabaseClient()
    .from("design_partner_beta_controls")
    .select("organization_id, status, maximum_contracts, maximum_provider_connections, maximum_user_seats, allowed_providers, expires_at, grace_ends_at, founder_approved_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    organizationId: data.organization_id,
    status: data.status,
    maximumContracts: data.maximum_contracts,
    maximumProviderConnections: data.maximum_provider_connections,
    maximumUserSeats: data.maximum_user_seats,
    allowedProviders: data.allowed_providers,
    expiresAt: data.expires_at,
    graceEndsAt: data.grace_ends_at,
    founderApprovedAt: data.founder_approved_at
  } as DesignPartnerBetaControl;
}

export async function enforceDesignPartnerBetaMutation(input: Omit<Parameters<typeof evaluateDesignPartnerBetaMutation>[0], "control"> & { organizationId: string }) {
  const decision = evaluateDesignPartnerBetaMutation({
    ...input,
    control: await getDesignPartnerBetaControl(input.organizationId)
  });
  if (!decision.allowed) throw new Error(decision.message);
  return decision;
}
