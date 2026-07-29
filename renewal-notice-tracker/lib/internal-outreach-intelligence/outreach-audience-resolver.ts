import {
  hashContactIdentifier,
  sanitizeOutreachText
} from "@/lib/internal-outreach-intelligence/outreach-safety";
import type {
  InternalOutreachOpportunity,
  OutreachAudienceResolution,
  OutreachResolvedAudienceRole
} from "@/lib/internal-outreach-intelligence/outreach-types";

type OrganizationMember = {
  user_id?: string | null;
  role?: string | null;
  user?: {
    email?: string | null;
    full_name?: string | null;
    notification_email?: string | null;
  } | null;
};

function memberLabel(member: OrganizationMember | null | undefined) {
  if (!member) return null;
  return sanitizeOutreachText(member.user?.full_name ?? member.user?.email ?? member.user?.notification_email ?? member.user_id ?? "", 120) || null;
}

function findMemberByUserId(members: OrganizationMember[], userId: string | null | undefined) {
  if (!userId) return null;
  return members.find((member) => member.user_id === userId) ?? null;
}

function findMemberByRole(members: OrganizationMember[], roleHints: string[]) {
  return (
    members.find((member) => {
      const role = (member.role ?? "").toLowerCase();
      const email = (member.user?.email ?? member.user?.notification_email ?? "").toLowerCase();
      const name = (member.user?.full_name ?? "").toLowerCase();
      return roleHints.some((hint) => role.includes(hint) || email.includes(hint) || name.includes(hint));
    }) ?? null
  );
}

function roleForAudience(opportunity: InternalOutreachOpportunity): OutreachResolvedAudienceRole {
  if (opportunity.audience === "finance" || opportunity.opportunity_type === "finance_review") return "finance_reviewer";
  if (opportunity.audience === "procurement" || opportunity.opportunity_type === "procurement_review") return "procurement_reviewer";
  if (opportunity.audience === "legal" || opportunity.opportunity_type === "legal_review") return "legal_reviewer";
  if (opportunity.audience === "executive_sponsor") return "executive_sponsor";
  if (opportunity.audience === "customer_success") return "customer_success_owner";
  if (opportunity.audience === "account_manager") return "account_manager";
  if (opportunity.audience === "vendor_contact_placeholder") return "vendor_contact_placeholder";
  if (opportunity.approver_user_id) return "approver";
  return opportunity.owner_user_id ? "contract_owner" : "decision_owner";
}

function roleHints(role: OutreachResolvedAudienceRole) {
  if (role === "finance_reviewer") return ["finance", "cfo"];
  if (role === "procurement_reviewer") return ["procurement", "sourcing", "vendor"];
  if (role === "legal_reviewer") return ["legal", "counsel"];
  if (role === "executive_sponsor") return ["executive", "sponsor", "cfo"];
  if (role === "customer_success_owner") return ["customer", "success", "cs"];
  if (role === "account_manager") return ["account", "manager"];
  return [];
}

export function resolveOutreachAudience(input: {
  opportunity: InternalOutreachOpportunity;
  organizationMembers?: OrganizationMember[];
  contactIdentifier?: string | null;
}): OutreachAudienceResolution {
  const members = input.organizationMembers ?? [];
  const audienceRole = roleForAudience(input.opportunity);
  const blockerCodes: string[] = [];
  const warningCodes: string[] = [];
  let userId: string | null = null;
  let label: string | null = null;

  if (audienceRole === "vendor_contact_placeholder") {
    if (!input.contactIdentifier) warningCodes.push("vendor_contact_identifier_missing");
    return {
      audienceRole,
      audienceLabel: input.contactIdentifier ? "Vendor contact placeholder" : "Vendor contact not configured",
      userId: null,
      contactIdentifierHash: input.contactIdentifier ? hashContactIdentifier(input.contactIdentifier) : null,
      resolutionConfidence: input.contactIdentifier ? 0.7 : 0.3,
      blockerCodes: input.contactIdentifier ? [] : ["vendor_contact_unavailable"],
      warningCodes
    };
  }

  const directMember =
    findMemberByUserId(members, input.opportunity.approver_user_id) ??
    findMemberByUserId(members, input.opportunity.owner_user_id);
  const hintedMember = directMember ?? findMemberByRole(members, roleHints(audienceRole));
  if (hintedMember?.user_id) {
    userId = hintedMember.user_id;
    label = memberLabel(hintedMember);
  } else {
    blockerCodes.push("internal_owner_unassigned");
  }

  if (!members.length) warningCodes.push("organization_member_context_unavailable");
  if (audienceRole === "approver" && !input.opportunity.approver_user_id) warningCodes.push("approver_unassigned");

  return {
    audienceRole,
    audienceLabel: label ?? audienceRole.replaceAll("_", " "),
    userId,
    contactIdentifierHash: null,
    resolutionConfidence: userId ? (directMember ? 0.95 : 0.75) : 0.35,
    blockerCodes,
    warningCodes
  };
}
