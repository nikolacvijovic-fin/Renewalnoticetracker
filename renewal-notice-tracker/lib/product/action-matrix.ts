import type { CustomerRole, InternalRole } from "@/lib/product/shipping-profile";

export const SHIPPED_RUNTIME_ACTIONS = [
  "upload_import",
  "review_p0",
  "edit_p0",
  "assign_owner",
  "manage_reminders",
  "preview_extraction",
  "preview_reminders",
  "acknowledge_reminder",
  "record_decision",
  "close_reopen_cycle",
  "export_csv_xlsx",
  "export_ics",
  "manage_billing",
  "manage_org_settings",
  "submit_feedback",
  "request_deletion",
  "internal_rescue_actions"
] as const;

export type ShippedRuntimeAction = (typeof SHIPPED_RUNTIME_ACTIONS)[number];

type ActionRule = {
  customerRoles: readonly CustomerRole[];
  internalRoles: readonly InternalRole[];
  orgScope: "active_organization" | "explicit_organization";
  rationale: string;
};

export const SHIPPED_RUNTIME_ACTION_MATRIX: Record<ShippedRuntimeAction, ActionRule> = {
  upload_import: {
    customerRoles: ["admin", "operator"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Intake belongs to workspace operators, not passive owners or review-only users."
  },
  review_p0: {
    customerRoles: ["admin", "operator", "reviewer"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "P0 review belongs to the review lane and can be handled by admins or operators."
  },
  edit_p0: {
    customerRoles: ["admin", "operator", "reviewer"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Editing reminder-driving truth stays with the same review-capable roles."
  },
  assign_owner: {
    customerRoles: ["admin", "operator", "reviewer"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Owner assignment is part of preparing a contract for the trusted workflow."
  },
  manage_reminders: {
    customerRoles: ["admin", "operator", "reviewer"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Reminder schedule changes are operational workflow work, not owner-only business truth."
  },
  preview_extraction: {
    customerRoles: ["admin", "operator", "reviewer"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Extraction previews are review tooling and should not be treated as anonymous utilities."
  },
  preview_reminders: {
    customerRoles: ["admin", "operator", "reviewer"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Reminder previews belong to users who can review and tune the workflow."
  },
  acknowledge_reminder: {
    customerRoles: ["admin", "operator", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Acknowledgment is part of the accountable owner loop, not the reviewer lane."
  },
  record_decision: {
    customerRoles: ["admin", "operator", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Business decisions belong to accountable operators and owners, not reviewers."
  },
  close_reopen_cycle: {
    customerRoles: ["admin", "operator", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Cycle state control follows the same accountability lane as decisions."
  },
  export_csv_xlsx: {
    customerRoles: ["admin", "operator", "reviewer", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Structured contract exports are part of the shipped reporting and ops workflow."
  },
  export_ics: {
    customerRoles: ["admin", "operator", "reviewer", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Per-contract ICS export is a shipped baseline reminder-delivery aid."
  },
  manage_billing: {
    customerRoles: ["admin", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Commercial authority stays with organization admins and owners."
  },
  manage_org_settings: {
    customerRoles: ["admin", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Org-level settings need administrative authority."
  },
  submit_feedback: {
    customerRoles: ["admin", "operator", "reviewer", "owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Workflow feedback is a customer support signal that active participants can submit without changing operational truth."
  },
  request_deletion: {
    customerRoles: ["owner"],
    internalRoles: [],
    orgScope: "active_organization",
    rationale: "Workspace deletion remains owner-only in shipped-first runtime."
  },
  internal_rescue_actions: {
    customerRoles: [],
    internalRoles: ["internal_support", "internal_admin"],
    orgScope: "explicit_organization",
    rationale: "Internal rescue actions must be unreachable to customer roles and always org-targeted."
  }
} as const;

export const SHIPPED_EXPORT_CLASSIFICATION = {
  csv: {
    action: "export_csv_xlsx",
    auditAction: "contracts.exported",
    commercialFeature: "exports",
    baseline: false
  },
  xlsx: {
    action: "export_csv_xlsx",
    auditAction: "contracts.exported",
    commercialFeature: "exports",
    baseline: false
  },
  ics: {
    action: "export_ics",
    auditAction: "contract.ics_exported",
    commercialFeature: null,
    baseline: true
  }
} as const;
