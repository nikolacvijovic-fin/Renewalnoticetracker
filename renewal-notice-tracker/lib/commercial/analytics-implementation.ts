export type AnalyticsImplementationSection = {
  title: string;
  items: string[];
};

export type AnalyticsSchemaRecommendation = {
  area: string;
  recommendation: string;
  whyItMatters: string;
};

export type AnalyticsStorageRecommendation = {
  tableOrStore: string;
  purpose: string;
  notes: string[];
};

export type AnalyticsPipelineConsideration = {
  area: string;
  recommendation: string;
  riskIfIgnored: string;
};

export type AnalyticsTrackingSplit = {
  category:
    | "server_side"
    | "client_side"
    | "derived_from_state"
    | "event_only";
  title: string;
  items: string[];
};

export type AnalyticsGovernanceRule = {
  rule: string;
  whyItMatters: string;
};

export const analyticsTrackingPrioritiesNow: AnalyticsImplementationSection = {
  title: "Tracking priorities now",
  items: [
    "Instrument the core activation path: signup, first upload/import, first review, first owner, first reminder, first live obligation.",
    "Instrument the core commercial path: pricing page viewed, upgrade prompt viewed/clicked, commercial gate shown/clicked, checkout started/completed, plan changed, plan cancelled.",
    "Instrument reliability-critical workflow events: reminder sent/failed, extraction completed/failed, review completed, import completed/failed.",
    "Start capturing support time and onboarding time per organization instead of only ticket counts.",
    "Attach organization_id, plan_tier, source, and event_version to every commercially meaningful event."
  ]
};

export const analyticsTrackingPrioritiesNext: AnalyticsImplementationSection = {
  title: "Tracking priorities next",
  items: [
    "Add account-health signal events and snapshots for CS workflows.",
    "Capture extraction cost and notification cost at the organization level.",
    "Track workflow-view events that matter for retention, such as due-soon, needs-review, and decision views.",
    "Instrument service delivery logs for onboarding, import cleanup, reporting, and training packages.",
    "Build source-to-margin attribution tables, not just source-to-signup attribution."
  ]
};

export const analyticsTrackingPrioritiesLater: AnalyticsImplementationSection = {
  title: "Tracking priorities later",
  items: [
    "Add richer template- or document-type attribution for extraction quality analysis.",
    "Add model/provider-specific extraction cost and quality comparisons.",
    "Add deeper executive reporting and expansion-readiness modeling from accumulated account history.",
    "Add automated anomaly detection for margin-risk, churn-risk, and reliability-risk clusters."
  ]
};

export const analyticsSchemaRecommendations: AnalyticsSchemaRecommendation[] = [
  {
    area: "Event schema",
    recommendation:
      "Use a single canonical analytics event shape with event_name, occurred_at, event_version, organization_id, user_id nullable, actor_type, session_id nullable, source nullable, plan_tier nullable, entity_type, entity_id, idempotency_key, and properties JSONB.",
    whyItMatters: "A stable shape prevents each feature from inventing incompatible tracking."
  },
  {
    area: "Properties",
    recommendation:
      "Keep common dimensions as top-level columns and only feature-specific detail inside properties JSONB.",
    whyItMatters: "Top-level columns make dashboards and filters much easier and cheaper to build."
  },
  {
    area: "Snapshots",
    recommendation:
      "Store periodic organization health and profitability snapshots separately from raw events.",
    whyItMatters: "Many metrics are stateful and should not be recomputed only from event streams."
  },
  {
    area: "Versions",
    recommendation:
      "Add explicit event_version and metric_definition_version fields whenever meaning changes.",
    whyItMatters: "Metric drift is guaranteed unless versioning is explicit."
  }
];

export const analyticsStorageRecommendations: AnalyticsStorageRecommendation[] = [
  {
    tableOrStore: "analytics_events",
    purpose: "Canonical append-only event table for product, commercial, reliability, and CS events.",
    notes: [
      "Partition by date if volume grows.",
      "Index on organization_id, event_name, occurred_at, and idempotency_key.",
      "Treat this as immutable except for rare data-quality repair jobs."
    ]
  },
  {
    tableOrStore: "organization_health_snapshots",
    purpose: "Daily or weekly point-in-time account health, workflow depth, and churn-risk snapshots.",
    notes: [
      "Derived from both events and database state.",
      "Use for CS queues and trend comparisons.",
      "Include score inputs, not just the final score."
    ]
  },
  {
    tableOrStore: "organization_profitability_snapshots",
    purpose: "Periodic contribution margin, support burden, onboarding burden, extraction cost, and notification cost by organization.",
    notes: [
      "Keep one row per organization per period.",
      "Join against plan, source, and segment.",
      "Power margin-risk dashboards and finance review."
    ]
  },
  {
    tableOrStore: "support_time_logs",
    purpose: "Time-based support and CS effort allocation.",
    notes: [
      "Minutes_spent matters more than ticket count.",
      "Tag by issue_type, paid_vs_included, and owner.",
      "Needed for real margin analysis."
    ]
  },
  {
    tableOrStore: "onboarding_time_logs",
    purpose: "Time-based onboarding and service delivery effort allocation.",
    notes: [
      "Separate included onboarding from paid packages.",
      "Tag import cleanup vs workflow setup vs training.",
      "Needed for payback and service margin."
    ]
  },
  {
    tableOrStore: "cost_usage_logs",
    purpose: "Estimated extraction and notification cost records by organization and workflow object.",
    notes: [
      "Keep provider/model/channel-level cost detail.",
      "Use reminder_id or contract_id where possible.",
      "Join back to organizations for profitability."
    ]
  }
];

export const analyticsPipelineConsiderations: AnalyticsPipelineConsideration[] = [
  {
    area: "Event ingestion",
    recommendation:
      "Prefer server-side event writes for billing, imports, review completion, reminders, and reliability events. Client-side should enrich UX funnel context, not be the source of truth for critical events.",
    riskIfIgnored: "Critical commercial and workflow events will go missing or become easy to spoof."
  },
  {
    area: "Derived metrics",
    recommendation:
      "Compute health, retention, and profitability snapshots in scheduled jobs from both events and current relational state.",
    riskIfIgnored: "Pure event reconstruction will become brittle and expensive for stateful metrics."
  },
  {
    area: "Attribution",
    recommendation:
      "Persist source and campaign on organization creation and carry them into derived tables.",
    riskIfIgnored: "Source-to-margin analysis will collapse into shallow top-of-funnel reporting."
  },
  {
    area: "Backfills",
    recommendation:
      "Design snapshot jobs so old periods can be recomputed if metric definitions change.",
    riskIfIgnored: "Metric-version changes will break historical comparability."
  },
  {
    area: "Latency",
    recommendation:
      "Use near-real-time updates only for reliability and ops dashboards; daily batch is enough for most product, CS, and profitability views.",
    riskIfIgnored: "The team wastes effort over-optimizing dashboards that do not need real-time freshness."
  }
];

export const analyticsDashboardBuildOrder: AnalyticsImplementationSection = {
  title: "Dashboard build order",
  items: [
    "1. Founder / Executive dashboard with revenue, retention, and margin quality.",
    "2. Product activation dashboard with first-value funnel and workflow drop-offs.",
    "3. Growth / Revenue dashboard with pricing funnel, gate conversion, and checkout leakage.",
    "4. Retention / Customer Success dashboard with health score and rescue queues.",
    "5. Reliability / Trust dashboard with reminder, extraction, and wrong-behavior signals.",
    "6. Support / Operations dashboard with burden, rescue, and automation priorities."
  ]
};

export const analyticsQaPlan: AnalyticsImplementationSection = {
  title: "QA and testing plan",
  items: [
    "Unit test metric definitions and snapshot logic against fixed fixtures.",
    "Add route and action tests that assert critical server-side events are emitted.",
    "Add client-side tests only for prompt and UI-view events that cannot be inferred server-side.",
    "Create a staging analytics smoke test that walks signup to first value to checkout.",
    "Run duplicate-event and retry-event tests for idempotent flows like billing, imports, and reminders.",
    "Validate dashboards against source SQL or fixtures before publishing definitions as canonical."
  ]
};

export const analyticsInstrumentationMistakesToAvoid: AnalyticsImplementationSection = {
  title: "Common instrumentation mistakes to avoid",
  items: [
    "Tracking generic clicks and page views while skipping workflow milestones.",
    "Relying on client-side events for billing or other source-of-truth events.",
    "Counting all contracts instead of active tracked contracts.",
    "Using ticket counts instead of time-based support burden.",
    "Failing to version events and metric definitions.",
    "Letting properties drift across similar events with different naming.",
    "Tracking duplicate retry events without idempotency keys.",
    "Mixing paid services work with free support in the same cost bucket."
  ]
};

export const analyticsGovernanceRules: AnalyticsGovernanceRule[] = [
  {
    rule: "No new product, billing, or ops workflow ships without an explicit analytics event or state derivation decision.",
    whyItMatters: "Analytics gaps are cheaper to prevent than to reconstruct later."
  },
  {
    rule: "Every event name must follow snake_case past-tense or completed-action conventions and be documented before release.",
    whyItMatters: "Naming drift ruins long-term usability."
  },
  {
    rule: "Critical metrics must have one canonical definition owner and one machine-readable source of truth.",
    whyItMatters: "Multiple definitions create political dashboards instead of operational ones."
  },
  {
    rule: "Server-side events are authoritative for billing, reliability, imports, reviews, and reminder processing.",
    whyItMatters: "These events drive money, trust, and ops escalation."
  },
  {
    rule: "Derived snapshot jobs must be versioned and backfillable.",
    whyItMatters: "Retention, health, and profitability are stateful and definitions will evolve."
  },
  {
    rule: "Support, onboarding, and service effort must be logged against organization_id.",
    whyItMatters: "Margin cannot be managed from anecdote."
  }
];

export const analyticsTrackingSplit: AnalyticsTrackingSplit[] = [
  {
    category: "server_side",
    title: "Track server-side",
    items: [
      "billing and plan changes",
      "imports initiated/completed/failed",
      "contract review completion",
      "owner assignment writes",
      "reminder creation and send outcomes",
      "renewal decision writes",
      "commercial denials",
      "extraction completion/failure",
      "admin rescue actions"
    ]
  },
  {
    category: "client_side",
    title: "Track client-side",
    items: [
      "pricing page viewed",
      "upgrade prompt viewed and clicked",
      "commercial gate viewed and clicked",
      "workflow view revisits like due-soon or needs-review",
      "interactive onboarding checklist step views"
    ]
  },
  {
    category: "derived_from_state",
    title: "Derive from database state",
    items: [
      "active tracked contract counts",
      "reviewed-contract rate",
      "owner-assignment rate",
      "reminder-coverage rate",
      "account health score",
      "unhealthy-account rate",
      "gross retention and net retention snapshots",
      "margin-risk rate"
    ]
  },
  {
    category: "event_only",
    title: "Event-based only",
    items: [
      "pricing funnel steps",
      "checkout funnel",
      "upgrade prompt conversion",
      "commercial gate conversion",
      "retry recovery patterns",
      "time to first value",
      "time to paid"
    ]
  }
];

export const analyticsIdempotencyRules: AnalyticsImplementationSection = {
  title: "Idempotency and duplicate-event handling",
  items: [
    "Require idempotency_key for billing webhooks, import jobs, reminder sends, retry attempts, and cron-triggered events.",
    "For retry-prone jobs, allow repeated attempts but only one canonical terminal outcome event per entity and run window.",
    "Deduplicate on organization_id, event_name, entity_id, and idempotency_key where possible.",
    "Never let UI retries create duplicate authoritative server-side events.",
    "Store raw duplicate attempts if needed for ops debugging, but exclude them from canonical metric models."
  ]
};
