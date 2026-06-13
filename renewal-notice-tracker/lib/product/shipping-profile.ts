export const CUSTOMER_ROLES = ["admin", "operator", "reviewer", "owner"] as const;
export type CustomerRole = (typeof CUSTOMER_ROLES)[number];

export const INTERNAL_ROLES = ["internal_support", "internal_admin"] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

export const LEGACY_CUSTOMER_ROLE_ALIASES = {
  member: "operator"
} as const;

export const SHIPPED_FIRST_DECISION_STATUSES = [
  "undecided",
  "renew",
  "terminate",
  "renegotiate",
  "defer",
  "no_action_required"
] as const;

export const SHIPPED_FIRST_CYCLE_STATUSES = [
  "open",
  "awaiting_acknowledgment",
  "awaiting_decision",
  "parked",
  "closed",
  "reopened",
  "superseded"
] as const;

type PublicPlan = {
  slug: string;
  name: string;
  price: string;
  cadence: string;
  annualLabel: string;
  contractBand: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

export const SHIPPED_FIRST_SCOPE = {
  appName: "NoticeControl",
  productTagline: "Stop surprise auto-renewals by turning buried notice dates into owners, reminders, and decisions.",
  shippedFirstFeatures: [
    "manual_contract_upload",
    "fixed_csv_xlsx_template_import",
    "vendor_side_primary_workflow",
    "p0_notice_fields_only",
    "fast_review_for_clean_p0_fields",
    "exception_review_for_conflicts_or_weak_evidence",
    "owner_assignment_before_trusted_workflow",
    "email_reminders",
    "basic_in_app_due_soon_queue",
    "per_contract_ics_export",
    "acknowledgment_for_high_risk_reminders",
    "decision_status_tracking",
    "single_active_renewal_cycle_behavior",
    "critical_action_audit_logging",
    "early_reporting_only",
    "counterparty_normalization_v1",
    "paddle_primary_billing",
    "manual_invoice_exceptions",
    "customer_services_onboarding_import_cleanup_renewal_ops"
  ],
  deferredFeatures: [
    "monthly_digest_delivery",
    "paypal_customer_billing_runtime",
    "stripe_customer_billing_runtime",
    "slack_teams_delivery",
    "native_calendar_sync",
    "drive_or_sharepoint_watchers",
    "advanced_playbooks",
    "advanced_ocr_metering",
    "advanced_governance_dashboards",
    "customer_visible_health_scores",
    "customer_visible_readiness_or_capacity_scores",
    "customer_visible_internal_analytics",
    "granular_enterprise_rbac"
  ],
  internalOnlyFeatures: [
    "internal_ops_dashboard",
    "internal_readiness_scoring",
    "internal_capacity_scoring",
    "internal_strategy_objects",
    "internal_support_economics",
    "internal_privacy_operations",
    "internal_debug_logs"
  ],
  permanentlyExcludedFeatures: [
    "full_clm",
    "drafting",
    "redlining",
    "negotiation",
    "esignature",
    "crm_orchestration",
    "erp_integrations",
    "sharepoint_replacement",
    "customer_facing_strategy_dashboards"
  ],
  customerNavigation: [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/risk-queue", label: "Risk Queue" },
    { href: "/dashboard/financial-intelligence", label: "Financial" },
    { href: "/dashboard/procurement-analytics", label: "Procurement" },
    { href: "/dashboard/contracts", label: "Contracts" },
    { href: "/dashboard/settings", label: "Settings" },
    { href: "/pricing", label: "Pricing" },
    { href: "/services", label: "Services" }
  ],
  internalOnlyRoutes: ["/internal/ops", "/dashboard/admin", "/packaging"],
  customerFacingServices: [
    {
      slug: "onboarding",
      name: "Onboarding Setup",
      summary: "Fixed-scope workspace setup for first reviewed contracts, owners, and reminder readiness.",
      includes: [
        "Workspace setup",
        "Notification defaults",
        "Owner model setup",
        "First review queue walkthrough"
      ]
    },
    {
      slug: "import-cleanup",
      name: "Import Cleanup",
      summary: "Spreadsheet cleanup, template alignment, and first import for messy contract lists.",
      includes: [
        "CSV/XLSX template alignment",
        "Duplicate cleanup",
        "Owner email cleanup",
        "First production import"
      ]
    },
    {
      slug: "renewal-ops-setup",
      name: "Renewal Ops Setup",
      summary: "Fixed-scope setup for reminder timing, acknowledgments, owners, and decision cadence.",
      includes: [
        "Reminder timing defaults",
        "High-risk acknowledgment workflow",
        "Owner accountability model",
        "Decision-status operating cadence"
      ]
    }
  ],
  publicPlans: [
    {
      slug: "starter",
      name: "Starter",
      price: "$99",
      cadence: "/month",
      annualLabel: "or $79/mo billed annually",
      contractBand: "Up to 100 tracked contracts",
      description: "Core notice-window control for one team running reviewed contracts, owners, and reminders.",
      features: [
        "Manual upload and fixed-template CSV/XLSX import",
        "P0 review workflow for renewal and notice dates",
        "Required owner assignment before trusted reminders",
        "Email reminders, due-soon queue, and per-contract ICS export"
      ]
    },
    {
      slug: "growth",
      name: "Growth",
      price: "$349",
      cadence: "/month",
      annualLabel: "or $279/mo billed annually",
      contractBand: "Up to 500 tracked contracts",
      description: "Deeper team coordination for higher contract volume and more operational accountability.",
      features: [
        "Everything in Starter",
        "More tracked contract capacity",
        "Broader coordination workflow support",
        "Priority rollout support"
      ],
      highlight: true
    },
    {
      slug: "portfolio",
      name: "Portfolio",
      price: "Custom",
      cadence: "",
      annualLabel: "Custom annual contracts",
      contractBand: "500+ tracked contracts",
      description: "Custom rollout, governance, and support for larger portfolios without drifting into CLM.",
      features: [
        "Custom contract bands",
        "Manual invoice / wire transfer exceptions",
        "PayPal support-led exceptions by arrangement",
        "Governance and rollout support",
        "Custom implementation planning"
      ]
    }
  ] as PublicPlan[]
} as const;

export function normalizeCustomerRole(role: string | null | undefined): CustomerRole | null {
  if (!role) return null;
  if ((CUSTOMER_ROLES as readonly string[]).includes(role)) {
    return role as CustomerRole;
  }
  if (role in LEGACY_CUSTOMER_ROLE_ALIASES) {
    return LEGACY_CUSTOMER_ROLE_ALIASES[role as keyof typeof LEGACY_CUSTOMER_ROLE_ALIASES];
  }
  return null;
}
