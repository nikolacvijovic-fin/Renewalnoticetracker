import { cache as reactCache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeCustomerRole, type CustomerRole } from "@/lib/product/shipping-profile";
import {
  SHIPPED_RUNTIME_ACTION_MATRIX,
  type ShippedRuntimeAction
} from "@/lib/product/action-matrix";

export type MembershipRole = CustomerRole;
export type ActiveOrganizationMembership = {
  organization_id: string;
  role: MembershipRole;
};

export type ActiveOrganizationContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  organizationId: string;
  role: MembershipRole;
};

export type ShippedActionTarget = {
  organizationId?: string | null;
  assertScoped?: (organizationId: string) => Promise<unknown> | unknown;
  onDenied?: (input: {
    reason: "unauthorized" | "forbidden" | "cross_org";
    action: ShippedRuntimeAction;
    context: ActiveOrganizationContext | null;
    error?: unknown;
  }) => Promise<void> | void;
};

export type OrganizationPermission =
  | "manage_billing"
  | "export_contracts"
  | "manage_org_settings"
  | "run_rescue_actions"
  | "view_admin_debug"
  | "request_workspace_deletion";

export const ORGANIZATION_PERMISSION_MATRIX: Record<
  OrganizationPermission,
  MembershipRole[]
> = {
  manage_billing: [...SHIPPED_RUNTIME_ACTION_MATRIX.manage_billing.customerRoles],
  export_contracts: [...SHIPPED_RUNTIME_ACTION_MATRIX.export_csv_xlsx.customerRoles],
  manage_org_settings: [...SHIPPED_RUNTIME_ACTION_MATRIX.manage_org_settings.customerRoles],
  run_rescue_actions: [],
  view_admin_debug: [],
  request_workspace_deletion: [...SHIPPED_RUNTIME_ACTION_MATRIX.request_deletion.customerRoles]
};

export class OrganizationAuthorizationError extends Error {
  constructor(
    public readonly permission: OrganizationPermission | ShippedRuntimeAction,
    public readonly role: string
  ) {
    super(`Role "${role}" is not allowed to use permission "${permission}".`);
    this.name = "OrganizationAuthorizationError";
  }
}

export class ActiveOrganizationRequiredError extends Error {
  constructor(public readonly action: ShippedRuntimeAction) {
    super(`An active organization is required for action "${action}".`);
    this.name = "ActiveOrganizationRequiredError";
  }
}

export class ActiveOrganizationScopeError extends Error {
  constructor(
    public readonly action: ShippedRuntimeAction,
    public readonly activeOrganizationId: string,
    public readonly targetOrganizationId?: string | null
  ) {
    super(`Action "${action}" is not allowed outside the active organization.`);
    this.name = "ActiveOrganizationScopeError";
  }
}

export function hasRequiredRole(role: MembershipRole, allowedRoles: MembershipRole[]) {
  return allowedRoles.includes(role);
}

export function canUseOrganizationPermission(
  role: MembershipRole,
  permission: OrganizationPermission
) {
  return hasRequiredRole(role, ORGANIZATION_PERMISSION_MATRIX[permission]);
}

export function assertOrganizationPermission(
  role: MembershipRole,
  permission: OrganizationPermission
) {
  if (!canUseOrganizationPermission(role, permission)) {
    throw new OrganizationAuthorizationError(permission, role);
  }
}

export function canUseShippedRuntimeAction(
  role: MembershipRole,
  action: ShippedRuntimeAction
) {
  return hasRequiredRole(role, [...SHIPPED_RUNTIME_ACTION_MATRIX[action].customerRoles]);
}

export function assertShippedRuntimeAction(
  role: MembershipRole,
  action: ShippedRuntimeAction
) {
  if (!canUseShippedRuntimeAction(role, action)) {
    throw new OrganizationAuthorizationError(action, role);
  }
}

export async function assertCanUseShippedAction(
  context: ActiveOrganizationContext | null,
  action: ShippedRuntimeAction,
  object?: ShippedActionTarget
) {
  if (!context) {
    await object?.onDenied?.({
      reason: "unauthorized",
      action,
      context: null
    });
    throw new ActiveOrganizationRequiredError(action);
  }

  try {
    assertShippedRuntimeAction(context.role, action);
  } catch (error) {
    await object?.onDenied?.({
      reason: "forbidden",
      action,
      context,
      error
    });
    throw error;
  }

  if (
    object?.organizationId &&
    object.organizationId !== context.organizationId
  ) {
    const error = new ActiveOrganizationScopeError(
      action,
      context.organizationId,
      object.organizationId
    );
    await object.onDenied?.({
      reason: "cross_org",
      action,
      context,
      error
    });
    throw error;
  }

  if (object?.assertScoped) {
    try {
      await object.assertScoped(context.organizationId);
    } catch (error) {
      await object.onDenied?.({
        reason: "cross_org",
        action,
        context,
        error
      });
      throw error;
    }
  }

  return context;
}

const cache =
  typeof reactCache === "function"
    ? reactCache
    : <T extends (...args: never[]) => unknown>(fn: T) => fn;

export const getCurrentUser = cache(async () => {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth");
  }
  return user;
}

async function listNormalizedMemberships(userId: string) {
  const supabase = createServerSupabaseClient();
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", userId);

  if (error) throw error;

  return (memberships ?? [])
    .map((membership) => ({
      organization_id: (membership as { organization_id: string }).organization_id,
      role: normalizeCustomerRole((membership as { role: string | null }).role)
    }))
    .filter((membership): membership is { organization_id: string; role: MembershipRole } =>
      Boolean(membership.organization_id && membership.role)
    );
}

export async function listUserOrganizationMemberships(userId: string) {
  return listNormalizedMemberships(userId);
}

export async function getMembershipForOrganization(userId: string, organizationId: string) {
  const memberships = await listNormalizedMemberships(userId);
  return memberships.find((membership) => membership.organization_id === organizationId) ?? null;
}

type ActiveOrganizationResolution = {
  status: "ready" | "needs_selection" | "missing_membership";
  memberships: ActiveOrganizationMembership[];
  membership: ActiveOrganizationMembership | null;
};

async function resolveActiveOrganizationSelection(
  userId: string
): Promise<ActiveOrganizationResolution> {
  const supabase = createServerSupabaseClient();
  const [{ data: userRow, error: userError }, memberships] = await Promise.all([
    supabase
      .from("users")
      .select("default_organization_id")
      .eq("id", userId)
      .maybeSingle(),
    listNormalizedMemberships(userId)
  ]);

  if (userError) throw userError;

  const defaultOrganizationId = (userRow as { default_organization_id?: string | null } | null)
    ?.default_organization_id;

  if (defaultOrganizationId) {
    const selectedMembership =
      memberships.find((membership) => membership.organization_id === defaultOrganizationId) ?? null;

    if (selectedMembership) {
      return {
        status: "ready",
        memberships,
        membership: selectedMembership
      };
    }

    await supabase
      .from("users")
      .update({ default_organization_id: null })
      .eq("id", userId);
  }

  if (memberships.length === 0) {
    return {
      status: "missing_membership",
      memberships,
      membership: null
    };
  }

  if (memberships.length === 1) {
    const [onlyMembership] = memberships;
    if (!onlyMembership) {
      return {
        status: "missing_membership",
        memberships,
        membership: null
      };
    }

    await supabase
      .from("users")
      .update({ default_organization_id: onlyMembership.organization_id })
      .eq("id", userId);

    return {
      status: "ready",
      memberships,
      membership: onlyMembership
    };
  }

  return {
    status: "needs_selection",
    memberships,
    membership: null
  };
}

export async function getActiveOrganizationSelectionState(userId: string) {
  const selection = await resolveActiveOrganizationSelection(userId);
  return {
    memberships: selection.memberships,
    activeMembership: selection.membership,
    requiresSelection: selection.status === "needs_selection",
    hasMemberships: selection.memberships.length > 0
  };
}

export async function requireActiveOrganization() {
  const user = await requireUser();
  const selection = await resolveActiveOrganizationSelection(user.id);

  if (selection.status === "needs_selection") {
    redirect("/dashboard/settings?setup=active-organization");
  }

  if (!selection.membership?.organization_id) {
    redirect("/dashboard/settings?setup=organization");
  }

  return {
    user,
    organizationId: selection.membership.organization_id,
    role: selection.membership.role
  };
}

export async function getActiveOrganizationContextOrNull() {
  const user = await getCurrentUser();
  if (!user) return null;
  const selection = await resolveActiveOrganizationSelection(user.id);
  if (!selection.membership?.organization_id) return null;
  return {
    user,
    organizationId: selection.membership.organization_id,
    role: selection.membership.role
  };
}

export const requireOrganization = requireActiveOrganization;
export const getOrganizationContextOrNull = getActiveOrganizationContextOrNull;

export async function requireOrgRole(allowedRoles: MembershipRole[]) {
  const context = await requireActiveOrganization();
  if (!hasRequiredRole(context.role, allowedRoles)) {
    redirect("/dashboard");
  }
  return context;
}

export async function requireOrgPermission(permission: OrganizationPermission) {
  const context = await requireActiveOrganization();
  try {
    assertOrganizationPermission(context.role, permission);
  } catch {
    redirect("/dashboard");
  }
  return context;
}

export async function requireShippedRuntimeAction(action: ShippedRuntimeAction) {
  const context = await requireActiveOrganization();
  try {
    await assertCanUseShippedAction(context, action);
  } catch {
    redirect("/dashboard");
  }
  return context;
}
