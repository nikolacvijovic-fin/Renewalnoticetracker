export type DeferredCapabilityCategory =
  | "future_product_capabilities"
  | "internal_reference_only"
  | "legacy_migration_only"
  | "permanently_excluded";

export type DeferredRuntimeSurface = "none" | "internal_only" | "migration_only";

export type DeferredCapability = {
  slug: string;
  category: DeferredCapabilityCategory;
  allowedRuntimeSurface: DeferredRuntimeSurface;
  whyDeferred: string;
  activationRequirements: string[];
  modulePaths?: string[];
};

export const DEFERRED_CAPABILITIES: DeferredCapability[] = [
  {
    slug: "playbooks",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Playbooks add workflow breadth beyond the shipped-first reminder and decision loop.",
    activationRequirements: [
      "The weekly operator loop works without founder rescue.",
      "Playbook value is proven in live pilots.",
      "The action model is narrowed to specific workflow outcomes instead of generic process breadth."
    ],
    modulePaths: [
      "deferred/actions/contracts-future.ts",
      "deferred/components/contracts/playbook-form.tsx"
    ]
  },
  {
    slug: "custom_reminder_rules",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Custom reminder-rule editing introduces schedule complexity before the fixed trusted reminder kernel is fully proven.",
    activationRequirements: [
      "Default reminder schedules are trusted in production-like pilots.",
      "Rule editing has a constrained policy model.",
      "Retry and duplicate-suppression behavior stays deterministic after customization."
    ],
    modulePaths: [
      "deferred/actions/contracts-future.ts",
      "deferred/components/contracts/reminder-rule-form.tsx"
    ]
  },
  {
    slug: "retention_health_surfaces",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Customer-facing retention scoring adds interpretation burden before the shipped kernel is stable.",
    activationRequirements: [
      "Activation and churn signals reconcile to real outcomes.",
      "Retention views drive a clear customer decision instead of platform theater."
    ],
    modulePaths: ["deferred/components/dashboard/retention-health-panel.tsx"]
  },
  {
    slug: "advanced_governance_dashboards",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Governance depth is broader than the Phase-1 operator workflow and must not crowd the shipped dashboard.",
    activationRequirements: [
      "Core queues are habit-forming for pilot customers.",
      "Governance views are demanded by active paid accounts."
    ]
  },
  {
    slug: "enterprise_data_governance_retention",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Customer-configurable retention policies, legal hold, data residency, customer data export, and support-access review require Enterprise-grade policy, audit, deletion, backup, privacy, and customer communication controls.",
    activationRequirements: [
      "The data governance registry is promoted through a future Enterprise release gate.",
      "Retention/deletion policy is implemented per data class with legal-hold, backup, audit, and support-access semantics.",
      "Customer-facing claims are backed by tests, runbooks, and operator evidence rather than aspirational compliance language."
    ],
    modulePaths: [
      "lib/product/data-governance.ts",
      "docs/DATA_GOVERNANCE_RETENTION_BOUNDARY.md",
      "docs/enterprise/DATA_GOVERNANCE_IMPLEMENTATION_PLAN.md"
    ]
  },
  {
    slug: "advanced_integrations",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Slack, Teams, CRM, ERP, and native calendar sync are expansion work, not shipped-kernel requirements.",
    activationRequirements: [
      "Reminder email and in-app delivery are operationally reliable.",
      "Pilot evidence shows a specific integration improves conversion or retention.",
      "Provider-specific support burden is funded by plan economics."
    ],
    modulePaths: [
      "deferred/integrations/slack.ts",
      "deferred/integrations/teams.ts"
    ]
  },
  {
    slug: "public_api_integrations",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Public API keys, scoped tokens, webhooks, OAuth app connections, and external system integrations create platform-grade security, rate-limit, idempotency, audit, and support obligations.",
    activationRequirements: [
      "The platform API capability registry is promoted through a future enterprise release gate.",
      "Organization-scoped token lifecycle, scopes, rate limits, idempotency, audit, monitoring, and support runbooks are implemented.",
      "No internal route secret or provider webhook secret can be reused as a customer API credential."
    ],
    modulePaths: [
      "lib/product/platform-api.ts",
      "docs/API_AND_INTEGRATION_BOUNDARY.md",
      "docs/enterprise/API_INTEGRATION_IMPLEMENTATION_PLAN.md"
    ]
  },
  {
    slug: "broader_counterparty_system",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Phase-1 only needs normalization v1 and lightweight duplicate suggestions, not a broad counterparty workspace.",
    activationRequirements: [
      "The contract loop is stable.",
      "Multiple paying customers need cross-contract counterparty workflows."
    ]
  },
  {
    slug: "monthly_digest",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Monthly digest is outside the shipped-first trusted reminder loop and should not blur the weekly operator habit.",
    activationRequirements: [
      "Reminder-backed workflows are healthy without digest dependence.",
      "Digest value is proven without weakening operator action."
    ],
    modulePaths: ["deferred/email/send-digest.ts"]
  },
  {
    slug: "future_advanced_analytics",
    category: "future_product_capabilities",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "Advanced analytics, churn modeling, and profitability instrumentation are preserved for later activation and must not shape shipped runtime imports.",
    activationRequirements: [
      "The shipped kernel is stable and operator habits are proven.",
      "Instrumentation is complete enough to support decision-grade analytics without theater."
    ],
    modulePaths: [
      "deferred/analytics/advanced-analytics.ts",
      "docs/reference/future/ANALYTICS_IMPLEMENTATION_PLAN.md",
      "docs/reference/future/FULL_ANALYTICS_ARCHITECTURE.md"
    ]
  },
  {
    slug: "readiness_capacity_profitability_os",
    category: "internal_reference_only",
    allowedRuntimeSurface: "internal_only",
    whyDeferred:
      "Readiness, capacity, profitability, and similar operating-system artifacts are reference material, not shipped runtime UI.",
    activationRequirements: [
      "Only the minimum internal rescue console is active at runtime.",
      "Any future runtime activation serves real support operations instead of strategy presentation."
    ]
  },
  {
    slug: "packaging_and_roadmap_strategy",
    category: "internal_reference_only",
    allowedRuntimeSurface: "internal_only",
    whyDeferred:
      "Packaging, roadmap, and breadth strategy belong in offline reference rather than internal runtime surfaces.",
    activationRequirements: [
      "The material stays detached from customer routes and shipped-kernel imports."
    ]
  },
  {
    slug: "paypal_billing",
    category: "legacy_migration_only",
    allowedRuntimeSurface: "migration_only",
    whyDeferred:
      "PayPal exists only for historical compatibility and must not behave like an active shipped-first provider.",
    activationRequirements: [
      "A migration or legacy customer support case explicitly requires it."
    ],
    modulePaths: ["legacy/billing/providers/paypal.ts"]
  },
  {
    slug: "stripe_billing",
    category: "legacy_migration_only",
    allowedRuntimeSurface: "migration_only",
    whyDeferred:
      "Legacy Stripe paths remain only for migration history and must not shape the current Paddle-first runtime.",
    activationRequirements: [
      "A migration or legacy customer support case explicitly requires it."
    ],
    modulePaths: ["legacy/billing/providers/stripe-legacy.ts"]
  },
  {
    slug: "full_clm_expansion",
    category: "permanently_excluded",
    allowedRuntimeSurface: "none",
    whyDeferred:
      "NoticeControl is not a CLM, drafting, redlining, negotiation, or e-signature product.",
    activationRequirements: ["None. This is outside product direction."]
  }
];

export const DEFERRED_CAPABILITY_SLUGS = new Set(
  DEFERRED_CAPABILITIES.map((capability) => capability.slug)
);
