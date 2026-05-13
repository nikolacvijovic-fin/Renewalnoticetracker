"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  OrganizationAuthorizationError,
  getActiveOrganizationSelectionState,
  getActiveOrganizationContextOrNull,
  getMembershipForOrganization,
  requireShippedRuntimeAction,
  requireUser
} from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { profileSettingsSchema } from "@/lib/validation/settings";
import { toSlug } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { buildDeletionRequestEvidence } from "@/lib/commercial/privacy-operations";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getTrialWindow } from "@/lib/trial";

export async function setActiveOrganizationAction(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) {
    throw new Error("An active organization is required.");
  }

  const membership = await getMembershipForOrganization(user.id, organizationId);
  if (!membership?.organization_id) {
    throw new Error("You do not have access to that organization.");
  }

  const supabase = createServerSupabaseClient();
  const { error: updateError } = await supabase
    .from("users")
    .update({ default_organization_id: organizationId })
    .eq("id", user.id);

  if (updateError) throw updateError;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "settings.active_organization_changed",
    entityType: "organization",
    entityId: organizationId,
    details: { role: membership.role }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

export async function saveProfileSettingsAction(formData: FormData) {
  const user = await requireUser();
  const parsed = profileSettingsSchema.parse({
    full_name: formData.get("full_name"),
    notification_email: formData.get("notification_email"),
    organization_name: formData.get("organization_name"),
    billing_email: formData.get("billing_email")
  });

  const supabase = createServerSupabaseClient();
  const activeContext = await getActiveOrganizationContextOrNull();
  const selectionState = await getActiveOrganizationSelectionState(user.id);
  let organizationId = activeContext?.organizationId ?? null;
  const cookieStore = cookies();
  const acquisitionSource = cookieStore.get("marketing_source")?.value ?? null;
  const acquisitionCampaign = cookieStore.get("marketing_campaign")?.value ?? null;

  if (!organizationId) {
    if (selectionState.hasMemberships) {
      throw new Error("Select an active organization before updating workspace settings.");
    }

    const trialWindow = getTrialWindow();
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: parsed.organization_name,
        slug: `${toSlug(parsed.organization_name)}-${user.id.slice(0, 6)}`,
        created_by: user.id,
        trial_started_at: trialWindow.trialStartedAt,
        trial_ends_at: trialWindow.trialEndsAt,
        acquisition_source: acquisitionSource,
        acquisition_campaign: acquisitionCampaign
      })
      .select("id")
      .single();

    if (orgError) throw orgError;
    organizationId = organization.id;

    const { error: membershipError } = await supabase.from("memberships").insert({
      organization_id: organizationId,
      user_id: user.id,
      role: "owner"
    });

    if (membershipError) throw membershipError;

    await createAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "trial.started",
      entityType: "organization",
      entityId: organizationId,
      details: {
        trial_started_at: trialWindow.trialStartedAt,
        trial_ends_at: trialWindow.trialEndsAt,
        acquisition_source: acquisitionSource,
        acquisition_campaign: acquisitionCampaign
      }
    });

    cookieStore.delete("marketing_source");
    cookieStore.delete("marketing_campaign");

    await trackServerAnalyticsEvent({
      organizationId,
      actorUserId: user.id,
      eventName: "auth_signup_completed",
      sourceOfTruth: "event_and_state",
      idempotencyKey: `auth_signup_completed:${organizationId}`,
      properties: {
        acquisition_source: acquisitionSource,
        acquisition_campaign: acquisitionCampaign
      }
    });
  }

  const { error: userError } = await supabase.from("users").upsert({
    id: user.id,
    full_name: parsed.full_name,
    notification_email: parsed.notification_email,
    default_organization_id: organizationId
  });

  if (userError) throw userError;

  const currentContext = activeContext ?? (await getActiveOrganizationContextOrNull());
  const currentRole = currentContext?.role ?? "owner";
  const canManageOrg = currentRole === "owner" || currentRole === "admin";
  const submittedOrgSettings = {
    name: parsed.organization_name,
    billing_email: parsed.billing_email
  };
  const { data: currentOrg } = await supabase
    .from("organizations")
    .select("name, billing_email")
    .eq("id", organizationId)
    .maybeSingle();

  if (!canManageOrg) {
    const attemptedOrgMutation =
      currentOrg?.name !== submittedOrgSettings.name ||
      currentOrg?.billing_email !== submittedOrgSettings.billing_email;

    if (attemptedOrgMutation) {
      throw new OrganizationAuthorizationError("manage_org_settings", currentRole);
    }
  }

  if (canManageOrg) {
    const { error: orgUpdateError } = await supabase
      .from("organizations")
      .update({
        name: parsed.organization_name,
        billing_email: parsed.billing_email
      })
      .eq("id", organizationId);

    if (orgUpdateError) throw orgUpdateError;
  }

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "settings.updated",
    entityType: "organization",
    entityId: organizationId,
    details: {
      notification_email: parsed.notification_email,
      billing_email: canManageOrg ? parsed.billing_email : null,
      managed_org_settings_updated: canManageOrg
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

export async function requestWorkspaceDeletionAction() {
  const { user, organizationId, role } = await requireShippedRuntimeAction("request_deletion");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("deletion_requests").insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    scope: "workspace",
    status: "requested",
    evidence_json: buildDeletionRequestEvidence({
      requestedByRole: role,
      source: "settings"
    })
  });

  if (error) throw error;

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "privacy.workspace_deletion_requested",
    entityType: "deletion_request",
    details: { scope: "workspace", source: "settings" }
  });

  revalidatePath("/dashboard/settings");
}
