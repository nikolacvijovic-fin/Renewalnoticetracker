export type AnalyticsCurrentStateReview = {
  existingMetrics: string[];
  likelyAvailableEvents: string[];
  existingOperationalMetrics: string[];
  missingProductMetrics: string[];
  missingCommercialMetrics: string[];
  missingRetentionMetrics: string[];
  existingDashboards: string[];
  missingDashboards: string[];
  dangerousBlindSpots: string[];
  assumptions: string[];
};

export type AnalyticsMaturityScore = {
  area:
    | "product_analytics"
    | "activation_analytics"
    | "retention_analytics"
    | "revenue_analytics"
    | "profitability_analytics"
    | "reliability_analytics"
    | "customer_success_analytics"
    | "decision_making_readiness"
    | "instrumentation_completeness"
    | "overall_analytics_quality";
  label: string;
  score: number;
  rationale: string;
};

export type AnalyticsFrameworkSection = {
  title: string;
  objective: string;
  keyQuestions: string[];
  keyMetrics: string[];
};

export type EventTaxonomyDefinition = {
  eventName: string;
  trigger: string;
  requiredProperties: string[];
  optionalProperties: string[];
  whyItMatters: string;
};

export type EventTaxonomyCategory = {
  name:
    | "auth"
    | "onboarding"
    | "contract_creation"
    | "upload"
    | "extraction"
    | "review"
    | "ownership"
    | "reminders"
    | "rules_escalations"
    | "playbooks"
    | "decisions"
    | "exports"
    | "digest"
    | "billing"
    | "pricing"
    | "upgrade_prompts"
    | "admin_debug"
    | "errors_failures"
    | "inactivity_churn_signals";
  label: string;
  events: EventTaxonomyDefinition[];
};

export type AnalyticsImplementationPlan = {
  prioritiesNow: string[];
  prioritiesNext: string[];
  prioritiesLater: string[];
  mustTrackFromDayOne: string[];
  canWait: string[];
  schemaRecommendations: string[];
  eventNamingRules: string[];
  dataQualityRules: string[];
};

export type AnalyticsFinalRecommendation = {
  bestNorthStar: string;
  bestActivationDefinition: string;
  bestRetentionDefinition: string;
  bestChurnWarningFramework: string[];
  bestDashboardStructure: string[];
  topNextActions: string[];
};

export type EventModelConventions = {
  namingConventions: string[];
  eventCategories: string[];
  propertyConventions: string[];
  requiredGlobalProperties: string[];
  entityIds: string[];
  userOrgSessionContextRules: string[];
  deduplicationRules: string[];
  idempotencyConsiderations: string[];
  eventVersioningRules: string[];
  dataQualityRules: string[];
};

export type DetailedEventSpec = {
  eventName: string;
  trigger: string;
  actor: string;
  entity: string;
  properties: string[];
  whyItMatters: string;
};

export const analyticsCurrentStateReview: AnalyticsCurrentStateReview = {
  existingMetrics: [
    "contract counts and review backlog from operational queries",
    "reminder counts, send volumes, and failure counts from admin snapshot",
    "import job counts, statuses, and error messages",
    "extraction failure counts and recent failure logs",
    "plan tier, billing provider, subscription status, and trial fields",
    "some commercial events via audit logging for checkout, exports, imports, digest attempts, and denials"
  ],
  likelyAvailableEvents: [
    "contract created",
    "contract import started and completed",
    "reminder created",
    "renewal decision created",
    "export attempted and denied",
    "checkout started and billing portal opened",
    "feature denial and plan-gate audit records"
  ],
  existingOperationalMetrics: [
    "failed reminders",
    "failed notifications",
    "contracts needing review",
    "extraction failure count",
    "top reminder statuses",
    "import job outcomes"
  ],
  missingProductMetrics: [
    "time from signup to first upload",
    "time from upload to first review",
    "review coverage by cohort",
    "owner assignment coverage over time",
    "playbook and escalation adoption depth",
    "workspace-level workflow completion funnel"
  ],
  missingCommercialMetrics: [
    "true pricing page to signup attribution",
    "upgrade prompt performance by context",
    "plan-mix movement by acquisition source",
    "annual vs monthly conversion quality",
    "margin-adjusted CAC payback by segment"
  ],
  missingRetentionMetrics: [
    "weekly active workspaces with live obligations surfaced",
    "owner-gap and decision-gap trends by cohort",
    "contract-coverage expansion over time",
    "health-score transitions by account",
    "save-play effectiveness after churn-risk signals"
  ],
  existingDashboards: [
    "internal admin/debug dashboard for ops reliability",
    "internal strategy sections for profitability, GTM, retention, and analytics definitions"
  ],
  missingDashboards: [
    "real founder KPI dashboard tied to live event data",
    "product activation funnel dashboard",
    "growth dashboard with source-to-paid funnel",
    "customer success health and expansion dashboard",
    "trust and quality dashboard for extraction/review accuracy"
  ],
  dangerousBlindSpots: [
    "the team can see operational failures faster than adoption failures",
    "commercial events exist, but the product still lacks a full workflow-level activation funnel",
    "reliability is partially measurable, but trust in extracted data is not quantified enough",
    "support burden and gross margin by account are still strategy concepts more than systemized live analytics"
  ],
  assumptions: [
    "audit logging is the main current analytics event sink",
    "billing and import workflows already emit some machine-readable events",
    "most missing analytics are instrumentation and modeling gaps, not conceptual gaps",
    "the product is still early enough that adding discipline now will compound"
  ]
};

export const analyticsMaturityScores: AnalyticsMaturityScore[] = [
  {
    area: "product_analytics",
    label: "Product analytics maturity",
    score: 5,
    rationale: "There is enough state to infer workflow depth, but not enough event coverage to measure product behavior cleanly."
  },
  {
    area: "activation_analytics",
    label: "Activation analytics maturity",
    score: 4,
    rationale: "First-value logic is defined, but the step-by-step funnel is not fully instrumented."
  },
  {
    area: "retention_analytics",
    label: "Retention analytics maturity",
    score: 5,
    rationale: "Health logic exists conceptually, but cohort-level recurring usage and save-play analytics still need more live data."
  },
  {
    area: "revenue_analytics",
    label: "Revenue analytics maturity",
    score: 6,
    rationale: "Billing state and some commercial events exist, but conversion quality and plan-mix analysis are still incomplete."
  },
  {
    area: "profitability_analytics",
    label: "Profitability analytics maturity",
    score: 4,
    rationale: "The business knows what it should monitor, but support cost, extraction cost, and margin by segment are not yet deeply connected to usage."
  },
  {
    area: "reliability_analytics",
    label: "Reliability analytics maturity",
    score: 7,
    rationale: "Reminder failures, notification failures, and import/extraction failures are already visible in admin tooling."
  },
  {
    area: "customer_success_analytics",
    label: "Customer success analytics maturity",
    score: 4,
    rationale: "Risk logic is defined, but the product still lacks a fully operational account-health dashboard backed by live signals."
  },
  {
    area: "decision_making_readiness",
    label: "Decision-making readiness",
    score: 5,
    rationale: "The strategy is strong, but live KPI systems are not yet mature enough for consistent operating decisions."
  },
  {
    area: "instrumentation_completeness",
    label: "Instrumentation completeness",
    score: 4,
    rationale: "Commercial events are partially tracked, while product, trust, and churn instrumentation remain incomplete."
  },
  {
    area: "overall_analytics_quality",
    label: "Overall analytics quality",
    score: 5,
    rationale: "Better than a blank slate, but still too uneven across product, revenue, retention, and margin."
  }
];

export const analyticsFramework: AnalyticsFrameworkSection[] = [
  {
    title: "Product usage analytics",
    objective: "Measure whether the product is being used as a renewal-ops workflow rather than passive storage.",
    keyQuestions: [
      "How many active tracked contracts are actually reviewed and trusted?",
      "How often do owners, reminders, and decisions get used?",
      "Which workflow steps stall after initial upload?"
    ],
    keyMetrics: [
      "reviewed contract coverage",
      "owner assignment coverage",
      "first reminder rate",
      "renewal decision coverage",
      "saved-view usage",
      "playbook usage"
    ]
  },
  {
    title: "Activation analytics",
    objective: "Measure how fast a workspace reaches first real value and where it drops off.",
    keyQuestions: [
      "How long does it take to get from signup to first upload?",
      "How many uploads become reviewed contracts?",
      "How many reviewed contracts become owned workflows?"
    ],
    keyMetrics: [
      "signup-to-first-upload rate",
      "upload-to-first-review rate",
      "review-to-first-owner rate",
      "days-to-first-value",
      "activation by source"
    ]
  },
  {
    title: "Conversion and upgrade analytics",
    objective: "Measure what creates paid intent and which gates convert versus annoy.",
    keyQuestions: [
      "Which upgrade prompts produce checkout starts?",
      "Which gates are encountered before first value versus after it?",
      "Which plans and terms convert best by segment?"
    ],
    keyMetrics: [
      "pricing page to signup",
      "activation-to-paid",
      "gate-view to gate-click",
      "checkout completion",
      "annual mix",
      "upgrade CTA conversion by context"
    ]
  },
  {
    title: "Retention analytics",
    objective: "Measure whether accounts are operationally embedded and expanding.",
    keyQuestions: [
      "Are contracts, owners, and decisions increasing over time?",
      "Are live obligations regularly surfaced?",
      "Which cohorts deepen workflow use and which go stale?"
    ],
    keyMetrics: [
      "weekly active workspaces",
      "review coverage trend",
      "owner coverage trend",
      "contracts with live obligations surfaced",
      "contract-count expansion",
      "cohort retention"
    ]
  },
  {
    title: "Expansion analytics",
    objective: "Measure whether more coverage, coordination depth, and services are increasing ACV.",
    keyQuestions: [
      "What leads Starter accounts to move to Growth?",
      "Which accounts are outgrowing their contract band?",
      "Which service packages convert into SaaS expansion?"
    ],
    keyMetrics: [
      "contract-band upgrades",
      "Starter to Growth rate",
      "service attach rate",
      "editor-seat expansion pressure",
      "Portfolio qualification rate"
    ]
  },
  {
    title: "Churn analytics",
    objective: "Detect account decay before cancellation and understand the real causes.",
    keyQuestions: [
      "Which behaviors predict early churn?",
      "Which accounts are active but shallow?",
      "Which rescue motions actually work?"
    ],
    keyMetrics: [
      "inactivity signal rate",
      "no-review accounts",
      "owner-gap accounts",
      "decision-gap accounts",
      "billing portal opens before cancellation",
      "save-play success rate"
    ]
  },
  {
    title: "Support and customer success analytics",
    objective: "Make support cost and success effort visible at the account level.",
    keyQuestions: [
      "Which accounts create disproportionate support load?",
      "What onboarding patterns predict support burden?",
      "Which customers need intervention versus expansion outreach?"
    ],
    keyMetrics: [
      "support hours per account",
      "ticket volume per account",
      "import cleanup burden",
      "health score distribution",
      "service opportunity count"
    ]
  },
  {
    title: "Reliability and ops analytics",
    objective: "Keep reminder delivery, imports, extraction, and cron processing trustworthy.",
    keyQuestions: [
      "Where are reminders failing?",
      "How often do imports or digests break?",
      "How healthy are retries and ops queues?"
    ],
    keyMetrics: [
      "reminder failure rate",
      "notification retry rate",
      "import failure rate",
      "digest success rate",
      "cron job lag",
      "mean time to resolve operational failures"
    ]
  },
  {
    title: "Trust and quality analytics",
    objective: "Measure whether users can trust extracted dates and workflow state.",
    keyQuestions: [
      "How often are extracted dates corrected?",
      "Which sources create low-confidence review burden?",
      "How complete is the portfolio from a trust perspective?"
    ],
    keyMetrics: [
      "extraction confidence distribution",
      "review correction rate",
      "time to trusted contract",
      "contracts missing owners",
      "contracts missing key dates",
      "evidence-linked review rate"
    ]
  },
  {
    title: "Finance and profitability analytics",
    objective: "Connect acquisition, usage, support, and cost so the team can optimize for margin, not optics.",
    keyQuestions: [
      "Which segments produce the best ACV after support cost?",
      "Which channels pay back fastest?",
      "Which accounts are revenue-positive but margin-negative?"
    ],
    keyMetrics: [
      "MRR",
      "ARR",
      "ACV by segment",
      "gross margin by segment",
      "payback by channel",
      "support cost as percent of ACV",
      "extraction cost per account"
    ]
  }
];

export const topProductKpis = [
  "active tracked contracts with reviewed dates",
  "reviewed contract coverage",
  "owner assignment coverage",
  "first reminder rate",
  "renewal decision coverage",
  "live obligations surfaced per workspace",
  "saved-view usage",
  "playbook usage",
  "multi-recipient reminder adoption",
  "time to trusted contract"
];

export const topRevenueKpis = [
  "MRR",
  "ARR",
  "new MRR",
  "expansion MRR",
  "NRR",
  "trial-to-paid conversion",
  "activation-to-paid conversion",
  "annual mix",
  "ACV by segment",
  "checkout completion rate"
];

export const topRetentionKpis = [
  "weekly active workspaces",
  "review coverage trend",
  "owner coverage trend",
  "decision coverage trend",
  "contract-count expansion",
  "workspaces with live obligations surfaced",
  "logo retention",
  "gross revenue retention",
  "health score distribution",
  "save-play success rate"
];

export const topReliabilityKpis = [
  "reminder job success rate",
  "notification delivery success rate",
  "retry rate",
  "digest success rate",
  "import success rate",
  "extraction failure rate",
  "review backlog aging",
  "cron lag",
  "mean time to recovery",
  "ops recurrence rate"
];

export const topSupportCustomerSuccessKpis = [
  "support hours per account",
  "tickets per account",
  "import cleanup hours per account",
  "time-to-resolution",
  "onboarding completion rate",
  "health score coverage",
  "accounts at risk",
  "expansion-ready account count",
  "service package attach rate",
  "training burden per account"
];

export const analyticsEventTaxonomy: EventTaxonomyCategory[] = [
  {
    name: "auth",
    label: "Auth",
    events: [
      {
        eventName: "auth_signup_completed",
        trigger: "A user completes signup and workspace creation.",
        requiredProperties: ["organization_id", "user_id", "source", "campaign"],
        optionalProperties: ["referrer", "trial_start_at", "persona_guess"],
        whyItMatters: "Starts the lifecycle and ties acquisition source to activation quality."
      },
      {
        eventName: "auth_login_completed",
        trigger: "A user successfully signs in.",
        requiredProperties: ["organization_id", "user_id"],
        optionalProperties: ["plan_tier", "role", "days_since_signup"],
        whyItMatters: "Supports re-engagement and active-usage measurement."
      }
    ]
  },
  {
    name: "onboarding",
    label: "Onboarding",
    events: [
      {
        eventName: "onboarding_checklist_viewed",
        trigger: "The dashboard checklist is rendered for a workspace.",
        requiredProperties: ["organization_id", "plan_tier"],
        optionalProperties: ["completed_steps", "trial_state"],
        whyItMatters: "Shows whether onboarding guidance is reaching users."
      },
      {
        eventName: "onboarding_step_completed",
        trigger: "A defined onboarding milestone is completed.",
        requiredProperties: ["organization_id", "step_name"],
        optionalProperties: ["days_since_signup", "plan_tier"],
        whyItMatters: "Enables funnel analysis by exact activation step."
      }
    ]
  },
  {
    name: "contract_creation",
    label: "Contract creation",
    events: [
      {
        eventName: "contract_created",
        trigger: "A contract record is created by any method.",
        requiredProperties: ["organization_id", "contract_id", "creation_method"],
        optionalProperties: ["plan_tier", "source"],
        whyItMatters: "Measures core workflow adoption and contract coverage."
      },
      {
        eventName: "contract_creation_denied",
        trigger: "Contract creation is blocked by a commercial gate.",
        requiredProperties: ["organization_id", "reason", "plan_tier"],
        optionalProperties: ["current_contract_count", "creation_method"],
        whyItMatters: "Shows high-intent monetization pressure."
      }
    ]
  },
  {
    name: "upload",
    label: "Upload",
    events: [
      {
        eventName: "contract_upload_started",
        trigger: "A file upload begins.",
        requiredProperties: ["organization_id", "file_type", "source"],
        optionalProperties: ["file_size_bytes", "plan_tier"],
        whyItMatters: "Measures top-of-funnel product engagement."
      },
      {
        eventName: "contract_upload_completed",
        trigger: "A file upload completes successfully.",
        requiredProperties: ["organization_id", "file_type", "contract_id"],
        optionalProperties: ["file_size_bytes", "plan_tier"],
        whyItMatters: "Feeds activation funnel and upload-source quality analysis."
      }
    ]
  },
  {
    name: "extraction",
    label: "Extraction",
    events: [
      {
        eventName: "extraction_completed",
        trigger: "AI extraction finishes for a contract.",
        requiredProperties: ["organization_id", "contract_id", "status"],
        optionalProperties: ["confidence_score", "page_count", "provider", "duration_ms"],
        whyItMatters: "Measures AI cost, throughput, and trust quality."
      },
      {
        eventName: "extraction_failed",
        trigger: "Extraction fails for a contract.",
        requiredProperties: ["organization_id", "contract_id", "stage", "error_code"],
        optionalProperties: ["provider", "duration_ms", "file_type"],
        whyItMatters: "Connects reliability issues to onboarding friction and cost."
      }
    ]
  },
  {
    name: "review",
    label: "Review",
    events: [
      {
        eventName: "contract_review_started",
        trigger: "A user opens a contract review flow.",
        requiredProperties: ["organization_id", "contract_id", "user_id"],
        optionalProperties: ["needs_review_reason", "plan_tier"],
        whyItMatters: "Shows whether extracted data is reaching trust-building review."
      },
      {
        eventName: "contract_review_completed",
        trigger: "A user completes a review submission.",
        requiredProperties: ["organization_id", "contract_id", "user_id"],
        optionalProperties: ["field_corrections_count", "evidence_linked", "duration_ms"],
        whyItMatters: "Marks the trust milestone that makes reminders meaningful."
      }
    ]
  },
  {
    name: "ownership",
    label: "Ownership",
    events: [
      {
        eventName: "contract_owner_assigned",
        trigger: "An owner is assigned to a contract.",
        requiredProperties: ["organization_id", "contract_id", "owner_type"],
        optionalProperties: ["department", "user_id", "plan_tier"],
        whyItMatters: "Measures operational embedding and accountability."
      }
    ]
  },
  {
    name: "reminders",
    label: "Reminders",
    events: [
      {
        eventName: "reminder_created",
        trigger: "A reminder is created.",
        requiredProperties: ["organization_id", "contract_id", "offset_days"],
        optionalProperties: ["channel", "recipient_count", "plan_tier"],
        whyItMatters: "Shows workflow activation and retention depth."
      },
      {
        eventName: "reminder_sent",
        trigger: "A reminder notification is successfully sent.",
        requiredProperties: ["organization_id", "reminder_id", "channel"],
        optionalProperties: ["recipient_count", "days_before_deadline"],
        whyItMatters: "Measures real workflow delivery, not just configuration."
      },
      {
        eventName: "reminder_failed",
        trigger: "Reminder delivery fails.",
        requiredProperties: ["organization_id", "reminder_id", "channel", "error_code"],
        optionalProperties: ["attempt_count", "next_retry_at"],
        whyItMatters: "Core reliability and trust signal."
      }
    ]
  },
  {
    name: "rules_escalations",
    label: "Rules and escalations",
    events: [
      {
        eventName: "escalation_rule_created",
        trigger: "An escalation or routing rule is saved.",
        requiredProperties: ["organization_id", "rule_type", "recipient_count"],
        optionalProperties: ["plan_tier", "channel"],
        whyItMatters: "Shows Growth-level workflow complexity and expansion readiness."
      },
      {
        eventName: "escalation_rule_denied",
        trigger: "A rule is blocked by plan limitations.",
        requiredProperties: ["organization_id", "rule_type", "plan_tier"],
        optionalProperties: ["recipient_count", "reason"],
        whyItMatters: "Captures one of the strongest coordination-driven upgrade moments."
      }
    ]
  },
  {
    name: "playbooks",
    label: "Playbooks",
    events: [
      {
        eventName: "playbook_applied",
        trigger: "A playbook or template is applied to a contract workflow.",
        requiredProperties: ["organization_id", "playbook_name"],
        optionalProperties: ["contract_id", "plan_tier"],
        whyItMatters: "Measures process standardization and maturity."
      }
    ]
  },
  {
    name: "decisions",
    label: "Decisions",
    events: [
      {
        eventName: "renewal_decision_recorded",
        trigger: "A renewal decision is saved.",
        requiredProperties: ["organization_id", "contract_id", "decision_status"],
        optionalProperties: ["days_before_deadline", "owner_assigned"],
        whyItMatters: "Strong retention and maturity signal."
      }
    ]
  },
  {
    name: "exports",
    label: "Exports",
    events: [
      {
        eventName: "export_requested",
        trigger: "A CSV or XLSX export is requested.",
        requiredProperties: ["organization_id", "format", "plan_tier"],
        optionalProperties: ["source", "filter_scope"],
        whyItMatters: "Shows reporting intent and executive visibility demand."
      },
      {
        eventName: "export_blocked",
        trigger: "An export is denied.",
        requiredProperties: ["organization_id", "format", "plan_tier", "reason"],
        optionalProperties: ["source"],
        whyItMatters: "Measures commercial pressure and frustration risk."
      }
    ]
  },
  {
    name: "digest",
    label: "Digest",
    events: [
      {
        eventName: "digest_configured",
        trigger: "A digest setting is enabled or changed.",
        requiredProperties: ["organization_id", "frequency", "recipient_count"],
        optionalProperties: ["plan_tier", "channel"],
        whyItMatters: "Measures recurring reporting habit formation."
      },
      {
        eventName: "digest_sent",
        trigger: "A digest is delivered successfully.",
        requiredProperties: ["organization_id", "recipient_count"],
        optionalProperties: ["channel", "plan_tier"],
        whyItMatters: "Shows leadership and admin reporting engagement."
      }
    ]
  },
  {
    name: "billing",
    label: "Billing",
    events: [
      {
        eventName: "billing_checkout_started",
        trigger: "A checkout session starts.",
        requiredProperties: ["organization_id", "target_plan", "billing_term"],
        optionalProperties: ["source", "provider", "current_plan"],
        whyItMatters: "Tracks hard purchase intent."
      },
      {
        eventName: "billing_plan_changed",
        trigger: "The plan changes through webhook or account action.",
        requiredProperties: ["organization_id", "previous_plan", "new_plan"],
        optionalProperties: ["billing_term", "provider", "change_type"],
        whyItMatters: "Supports revenue, upgrade, and churn analytics."
      }
    ]
  },
  {
    name: "pricing",
    label: "Pricing",
    events: [
      {
        eventName: "pricing_page_viewed",
        trigger: "The pricing page is loaded.",
        requiredProperties: ["source"],
        optionalProperties: ["campaign", "persona_guess", "referrer"],
        whyItMatters: "Starts the monetization funnel."
      }
    ]
  },
  {
    name: "upgrade_prompts",
    label: "Upgrade prompts",
    events: [
      {
        eventName: "upgrade_prompt_viewed",
        trigger: "An in-product upgrade prompt is shown.",
        requiredProperties: ["organization_id", "prompt_context", "current_plan"],
        optionalProperties: ["contract_count", "trial_days_left", "target_plan"],
        whyItMatters: "Lets the team compare prompt quality by moment."
      },
      {
        eventName: "upgrade_prompt_clicked",
        trigger: "An upgrade prompt CTA is clicked.",
        requiredProperties: ["organization_id", "prompt_context", "target_plan"],
        optionalProperties: ["current_plan", "cta_label"],
        whyItMatters: "Measures prompt persuasiveness."
      }
    ]
  },
  {
    name: "admin_debug",
    label: "Admin and debug",
    events: [
      {
        eventName: "admin_debug_viewed",
        trigger: "The admin/debug page is opened.",
        requiredProperties: ["organization_id", "user_id"],
        optionalProperties: ["section", "role"],
        whyItMatters: "Shows where operators are spending rescue effort."
      },
      {
        eventName: "reminder_rerun_triggered",
        trigger: "An admin reruns a failed reminder.",
        requiredProperties: ["organization_id", "reminder_id", "user_id"],
        optionalProperties: ["status_before", "attempt_count"],
        whyItMatters: "Measures operational rescue burden."
      }
    ]
  },
  {
    name: "errors_failures",
    label: "Errors and failures",
    events: [
      {
        eventName: "workflow_error_recorded",
        trigger: "A notable application or server error occurs.",
        requiredProperties: ["organization_id", "error_area", "error_code"],
        optionalProperties: ["contract_id", "job_id", "plan_tier"],
        whyItMatters: "Helps tie reliability failures to workflow and account impact."
      }
    ]
  },
  {
    name: "inactivity_churn_signals",
    label: "Inactivity and churn signals",
    events: [
      {
        eventName: "account_inactivity_flagged",
        trigger: "A workspace crosses an inactivity threshold.",
        requiredProperties: ["organization_id", "signal_type", "days_inactive"],
        optionalProperties: ["plan_tier", "last_meaningful_action", "health_status"],
        whyItMatters: "Supports save plays before cancellation."
      },
      {
        eventName: "cancellation_intent_detected",
        trigger: "A billing portal open, downgrade motion, or explicit cancel intent is observed.",
        requiredProperties: ["organization_id", "signal_source"],
        optionalProperties: ["plan_tier", "tenure_days", "health_status"],
        whyItMatters: "Separates generic account activity from real churn risk."
      }
    ]
  }
];

export const analyticsImplementationPlan: AnalyticsImplementationPlan = {
  prioritiesNow: [
    "Instrument the core activation funnel from signup to first reviewed, owned, live contract.",
    "Track commercial prompts and denials with consistent context properties.",
    "Connect import, extraction, review, reminder, and decision events into one workspace lifecycle.",
    "Expose founder, product, and support dashboards from live event data."
  ],
  prioritiesNext: [
    "Add account-health and churn-risk modeling.",
    "Track support hours, onboarding effort, and extraction cost per account.",
    "Build trust-quality metrics around review corrections and low-confidence extraction.",
    "Tie services attachment and expansion outcomes back to product adoption."
  ],
  prioritiesLater: [
    "Introduce richer cohort analysis by ICP and source.",
    "Model margin by account and by feature family.",
    "Add automated anomaly detection for reliability and churn risk.",
    "Build executive-level forecasting off retention and expansion cohorts."
  ],
  mustTrackFromDayOne: [
    "auth signup and source",
    "first upload",
    "first review",
    "first owner assignment",
    "first reminder",
    "first renewal decision",
    "checkout started and completed",
    "commercial gate shown and clicked",
    "import completed and failed",
    "reminder failures"
  ],
  canWait: [
    "deep playbook usage analytics if playbook adoption is still low",
    "advanced attribution models beyond source and campaign",
    "high-granularity viewer analytics",
    "fancy executive scorecards before the operating dashboards are stable"
  ],
  schemaRecommendations: [
    "Use a single append-only event stream with explicit organization_id and user_id when available.",
    "Version events with an event_version field when changing payload shape.",
    "Keep event names stable and move optionality into properties.",
    "Separate raw event capture from derived account-health tables and dashboard marts."
  ],
  eventNamingRules: [
    "Use snake_case names.",
    "Prefer verb-first, domain-specific names like contract_review_completed.",
    "Use the same noun vocabulary everywhere: contract, review, owner, reminder, decision, digest, checkout.",
    "Do not create synonymous duplicate events for the same user action."
  ],
  dataQualityRules: [
    "Every event must include organization_id when technically possible.",
    "Commercial events must include current plan tier.",
    "Workflow events should include contract_id when contract-specific.",
    "Emit one canonical success event per completed action and one canonical failure event per blocked or failed action.",
    "Keep source and prompt_context enums controlled, not free text.",
    "Backfill or mark null explicitly rather than silently omitting critical properties."
  ]
};

export const analyticsFinalRecommendation: AnalyticsFinalRecommendation = {
  bestNorthStar:
    "Active tracked contracts with reviewed dates, assigned owners, and live obligations surfaced in paying workspaces.",
  bestActivationDefinition:
    "A workspace activates when it gets one contract uploaded, reviewed, owner-assigned, reminder-enabled, and visible as a live obligation.",
  bestRetentionDefinition:
    "A retained workspace is one that keeps expanding trusted contract coverage and returns weekly to review obligations, owners, reminders, and decisions.",
  bestChurnWarningFramework: [
    "No upload after signup",
    "No review after upload",
    "No owner assignment after review",
    "No live obligations surfaced",
    "Review coverage stagnates",
    "Owner-gap or decision-gap widens",
    "Billing portal opens from a shallow account",
    "No meaningful activity across a weekly review cycle"
  ],
  bestDashboardStructure: [
    "Founder: revenue, margin, retention, and risk",
    "Product: activation, trust, workflow depth",
    "Growth: source-to-paid and upgrade performance",
    "Customer success: health, churn risk, expansion",
    "Support/operations: failures, recovery, burden",
    "Reliability/trust: extraction quality, reminder reliability, review confidence"
  ],
  topNextActions: [
    "Instrument the canonical activation events now.",
    "Add prompt-context and gate-context properties to commercial events.",
    "Track review correction and low-confidence extraction metrics.",
    "Add account inactivity and health transitions as first-class events.",
    "Connect billing plan changes to workspace behavior cohorts.",
    "Track support and onboarding effort at the account level.",
    "Publish founder, product, and support dashboards first.",
    "Normalize event naming and versioning before event volume grows.",
    "Treat vanity traffic and raw signup counts as secondary.",
    "Run the business on activation depth, retention depth, and gross margin."
  ]
};

export const eventModelConventions: EventModelConventions = {
  namingConventions: [
    "Use snake_case event names only.",
    "Use domain-first verb phrases like contract_review_completed, reminder_failed, billing_checkout_started.",
    "Prefer completed, failed, viewed, clicked, created, assigned, recorded, blocked for action semantics.",
    "Never create duplicate synonyms for the same action."
  ],
  eventCategories: [
    "auth",
    "onboarding",
    "contract workflow",
    "commercial and billing",
    "retention and churn",
    "reliability and debug"
  ],
  propertyConventions: [
    "Use snake_case for property names.",
    "Use explicit *_id fields for entities.",
    "Keep enums controlled for source, prompt_context, signal_type, creation_method, decision_status, and channel.",
    "Use *_at for timestamps and *_count for counts.",
    "Use is_* for booleans only where the binary meaning is obvious."
  ],
  requiredGlobalProperties: [
    "event_id",
    "event_name",
    "event_version",
    "occurred_at",
    "organization_id",
    "plan_tier",
    "actor_type",
    "source"
  ],
  entityIds: [
    "organization_id",
    "user_id",
    "session_id",
    "contract_id",
    "import_job_id",
    "reminder_id",
    "notification_log_id",
    "rule_id",
    "playbook_id",
    "decision_id",
    "billing_customer_id",
    "checkout_session_id"
  ],
  userOrgSessionContextRules: [
    "Every event should include organization_id when technically possible.",
    "User-driven events should include user_id and actor_type=user.",
    "System jobs should set actor_type=system and still include organization_id.",
    "Session-aware web events should include session_id for funnel stitching.",
    "Commercial events should include current plan_tier even if the action is denied."
  ],
  deduplicationRules: [
    "Use event_id as the primary unique key.",
    "For server-side retried jobs, dedupe on idempotency_key plus event_name.",
    "Treat repeated UI renders as non-events unless they cross a defined threshold or represent an explicit view event.",
    "Do not emit both a generic and a specific event for the same action completion."
  ],
  idempotencyConsiderations: [
    "Webhook, cron, retry, and background-job events must carry an idempotency_key.",
    "Billing events should use provider event IDs or checkout session IDs to prevent double-counting.",
    "Import and reminder retry flows should emit one canonical completion or failure event per processing attempt.",
    "Admin rescue actions should be logged separately from automated retries."
  ],
  eventVersioningRules: [
    "Every event must include event_version.",
    "Increase event_version when required or semantic properties change.",
    "Never silently repurpose an existing property name with a new meaning.",
    "Prefer additive optional properties before breaking changes."
  ],
  dataQualityRules: [
    "Reject events missing organization_id unless the event is truly pre-workspace marketing traffic.",
    "Reject commercial events missing plan_tier.",
    "Require contract_id for contract-specific workflow events.",
    "Normalize enums before persistence.",
    "Store null explicitly for unavailable optional fields instead of omitting inconsistently.",
    "Backfill event source using acquisition/trial attribution where possible."
  ]
};

export const detailedEventTable: DetailedEventSpec[] = [
  {
    eventName: "auth_signup_completed",
    trigger: "A user finishes signup and the workspace is created.",
    actor: "user",
    entity: "organization",
    properties: ["organization_id", "user_id", "session_id", "source", "campaign", "trial_start_at", "plan_tier"],
    whyItMatters: "Starts the lifecycle and anchors attribution, activation, and conversion analysis."
  },
  {
    eventName: "onboarding_step_completed",
    trigger: "A defined onboarding milestone is completed.",
    actor: "user",
    entity: "organization",
    properties: ["organization_id", "user_id", "step_name", "days_since_signup", "plan_tier"],
    whyItMatters: "Turns onboarding from vague progress into a measurable funnel."
  },
  {
    eventName: "contract_upload_completed",
    trigger: "A contract file upload completes successfully.",
    actor: "user",
    entity: "contract",
    properties: ["organization_id", "user_id", "session_id", "contract_id", "file_type", "file_size_bytes", "source", "plan_tier"],
    whyItMatters: "This is the first serious product-usage signal for most workspaces."
  },
  {
    eventName: "manual_contract_creation_attempted",
    trigger: "A manual contract creation submission is made.",
    actor: "user",
    entity: "contract",
    properties: ["organization_id", "user_id", "current_contract_count", "plan_tier", "source"],
    whyItMatters: "Shows high-intent product use and can indicate commercial pressure when denied."
  },
  {
    eventName: "import_completed",
    trigger: "A spreadsheet import finishes with full or partial success.",
    actor: "system",
    entity: "import_job",
    properties: ["organization_id", "import_job_id", "row_count", "imported_count", "error_count", "plan_tier", "source"],
    whyItMatters: "Measures migration success, portfolio expansion, and services leverage."
  },
  {
    eventName: "import_failed",
    trigger: "A spreadsheet import fails.",
    actor: "system",
    entity: "import_job",
    properties: ["organization_id", "import_job_id", "row_count", "error_code", "error_message", "plan_tier"],
    whyItMatters: "Direct signal of onboarding friction, support burden, and reliability drag."
  },
  {
    eventName: "extraction_completed",
    trigger: "AI extraction finishes for a contract.",
    actor: "system",
    entity: "contract",
    properties: ["organization_id", "contract_id", "status", "confidence_score", "provider", "duration_ms", "page_count"],
    whyItMatters: "Connects AI cost, quality, and trust to downstream review behavior."
  },
  {
    eventName: "extraction_failed",
    trigger: "AI extraction fails for a contract.",
    actor: "system",
    entity: "contract",
    properties: ["organization_id", "contract_id", "stage", "error_code", "provider", "duration_ms"],
    whyItMatters: "Shows where variable cost is being spent without value creation."
  },
  {
    eventName: "contract_review_completed",
    trigger: "A user submits a contract review.",
    actor: "user",
    entity: "contract",
    properties: ["organization_id", "user_id", "contract_id", "field_corrections_count", "evidence_linked", "duration_ms"],
    whyItMatters: "This is the trust milestone that makes reminders and deadlines usable."
  },
  {
    eventName: "contract_owner_assigned",
    trigger: "An owner is assigned to a contract.",
    actor: "user",
    entity: "contract",
    properties: ["organization_id", "user_id", "contract_id", "owner_type", "department", "plan_tier"],
    whyItMatters: "Operational embedding and retention improve when ownership is explicit."
  },
  {
    eventName: "reminder_created",
    trigger: "A reminder is created or saved.",
    actor: "user",
    entity: "reminder",
    properties: ["organization_id", "user_id", "contract_id", "reminder_id", "offset_days", "channel", "recipient_count", "plan_tier"],
    whyItMatters: "Shows the workflow moving from recordkeeping to active control."
  },
  {
    eventName: "multi_recipient_reminder_denied",
    trigger: "A multi-recipient reminder attempt is blocked.",
    actor: "system",
    entity: "reminder",
    properties: ["organization_id", "contract_id", "recipient_count", "plan_tier", "reason", "source"],
    whyItMatters: "One of the strongest natural Growth upgrade moments."
  },
  {
    eventName: "escalation_rule_created",
    trigger: "A custom reminder rule or escalation rule is saved.",
    actor: "user",
    entity: "rule",
    properties: ["organization_id", "user_id", "rule_id", "rule_type", "recipient_count", "channel", "plan_tier"],
    whyItMatters: "Measures coordination depth, process maturity, and expansion readiness."
  },
  {
    eventName: "playbook_applied",
    trigger: "A playbook is applied to a contract workflow.",
    actor: "user",
    entity: "playbook",
    properties: ["organization_id", "user_id", "playbook_id", "playbook_name", "contract_id", "plan_tier"],
    whyItMatters: "Shows standardization and repeatable workflow maturity."
  },
  {
    eventName: "renewal_decision_recorded",
    trigger: "A renewal decision is saved.",
    actor: "user",
    entity: "decision",
    properties: ["organization_id", "user_id", "decision_id", "contract_id", "decision_status", "days_before_deadline", "plan_tier"],
    whyItMatters: "A deep retention signal and strong indicator of real workflow adoption."
  },
  {
    eventName: "export_requested",
    trigger: "A CSV or XLSX export is requested.",
    actor: "user",
    entity: "organization",
    properties: ["organization_id", "user_id", "format", "filter_scope", "plan_tier", "source"],
    whyItMatters: "Shows reporting demand and executive visibility needs."
  },
  {
    eventName: "digest_sent",
    trigger: "A digest is delivered successfully.",
    actor: "system",
    entity: "organization",
    properties: ["organization_id", "recipient_count", "channel", "plan_tier", "frequency"],
    whyItMatters: "Reinforces recurring reporting and retention loops."
  },
  {
    eventName: "pricing_page_viewed",
    trigger: "The pricing page loads.",
    actor: "user_or_anonymous",
    entity: "session",
    properties: ["session_id", "source", "campaign", "referrer", "persona_guess"],
    whyItMatters: "Top-of-funnel monetization intent and channel-quality measurement."
  },
  {
    eventName: "upgrade_prompt_clicked",
    trigger: "A user clicks an in-product upgrade CTA.",
    actor: "user",
    entity: "organization",
    properties: ["organization_id", "user_id", "prompt_context", "current_plan", "target_plan", "contract_count", "trial_days_left"],
    whyItMatters: "Measures which monetization moments actually convert."
  },
  {
    eventName: "billing_checkout_started",
    trigger: "A checkout session is created.",
    actor: "user",
    entity: "checkout_session",
    properties: ["organization_id", "user_id", "checkout_session_id", "current_plan", "target_plan", "billing_term", "provider", "source"],
    whyItMatters: "Hard purchase intent and funnel-quality signal."
  },
  {
    eventName: "checkout_completed",
    trigger: "Billing confirms a successful paid conversion.",
    actor: "system",
    entity: "organization",
    properties: ["organization_id", "checkout_session_id", "previous_plan", "new_plan", "billing_term", "provider", "price_id", "source"],
    whyItMatters: "Core revenue conversion event."
  },
  {
    eventName: "plan_cancelled",
    trigger: "A subscription is cancelled or marked to cancel.",
    actor: "user_or_system",
    entity: "organization",
    properties: ["organization_id", "plan_tier", "provider", "tenure_days", "cancellation_reason", "signal_source"],
    whyItMatters: "Core churn event for retention, pricing, and CS analysis."
  },
  {
    eventName: "reminder_failed",
    trigger: "A reminder delivery attempt fails.",
    actor: "system",
    entity: "reminder",
    properties: ["organization_id", "reminder_id", "channel", "error_code", "attempt_count", "next_retry_at"],
    whyItMatters: "Reliability failure that directly threatens product trust."
  },
  {
    eventName: "workflow_error_recorded",
    trigger: "A notable application, import, extraction, or billing error is recorded.",
    actor: "system",
    entity: "workflow",
    properties: ["organization_id", "error_area", "error_code", "contract_id", "import_job_id", "plan_tier"],
    whyItMatters: "Lets the team tie technical failures back to customer and revenue risk."
  },
  {
    eventName: "account_inactivity_flagged",
    trigger: "A workspace crosses a predefined inactivity or shallow-usage threshold.",
    actor: "system",
    entity: "organization",
    properties: ["organization_id", "signal_type", "days_inactive", "last_meaningful_action", "plan_tier", "health_status"],
    whyItMatters: "Early warning for churn and save-play prioritization."
  },
  {
    eventName: "admin_debug_viewed",
    trigger: "An operator opens the admin/debug area.",
    actor: "user",
    entity: "organization",
    properties: ["organization_id", "user_id", "section", "role"],
    whyItMatters: "Shows where operational rescue effort is being spent and which accounts are noisy."
  }
];
