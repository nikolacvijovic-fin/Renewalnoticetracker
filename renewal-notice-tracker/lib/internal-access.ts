import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import type { InternalRole } from "@/lib/product/shipping-profile";
import {
  SHIPPED_RUNTIME_ACTION_MATRIX,
  type ShippedRuntimeAction
} from "@/lib/product/action-matrix";

type InternalEntry = {
  email: string;
  role: InternalRole;
};

function parseInternalAllowlist(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [email, role] = entry.split(":").map((part) => part.trim().toLowerCase());
      if (!email || !role) return [];
      if (role !== "internal_support" && role !== "internal_admin") return [];
      return [{ email, role }] satisfies InternalEntry[];
    });
}

export function resolveInternalRoleForEmail(
  email: string | null | undefined,
  allowlist = env.INTERNAL_OPERATOR_ALLOWLIST
) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const entry = parseInternalAllowlist(allowlist).find((item) => item.email === normalized);
  return entry?.role ?? null;
}

export async function requireInternalRole(allowedRoles: InternalRole[]) {
  const user = await requireUser();
  const role = resolveInternalRoleForEmail(user.email);
  if (!role || !allowedRoles.includes(role)) {
    redirect("/dashboard");
  }
  return { user, role };
}

export async function requireInternalActionAccess(
  action: ShippedRuntimeAction,
  organizationId: string
) {
  const allowedRoles = [...SHIPPED_RUNTIME_ACTION_MATRIX[action].internalRoles];
  const { user, role } = await requireInternalRole(allowedRoles);
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error("An explicit organization id is required for internal rescue actions.");
  }
  return { user, role, organizationId: normalizedOrganizationId };
}
