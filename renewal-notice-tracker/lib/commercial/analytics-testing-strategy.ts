export type AnalyticsInstrumentationTestArea = {
  area: string;
  tests: string[];
  validationRules: string[];
  dataQualityChecks: string[];
  whatToMonitorAfterRelease: string[];
};

export const analyticsTestingAreas: AnalyticsInstrumentationTestArea[] = [
  {
    area: "auth events",
    tests: [
      "integration test: signup/login/auth-callback events fire once per completed auth transition",
      "integration test: auth events carry organization, user, and source context where available",
      "integration test: failed auth attempts do not masquerade as successful signup/login events"
    ],
    validationRules: [
      "successful auth events require stable user identifier and event version",
      "signup-created-workspace events must include organization_id once org bootstrap succeeds",
      "client-side view events must not replace server-authoritative auth success events"
    ],
    dataQualityChecks: [
      "signup count should reconcile with created org/user records",
      "auth callback success events should not exceed successful auth sessions materially",
      "source attribution should not be null for marketing-origin auth flows at abnormal rates"
    ],
    whatToMonitorAfterRelease: [
      "unexpected drop in signup/auth success event volume",
      "rising duplicate auth success events per session",
      "loss of source attribution on auth conversions"
    ]
  },
  {
    area: "onboarding events",
    tests: [
      "integration test: first upload, first review, first owner, and first reminder events fire only on first completion",
      "integration test: onboarding checklist state aligns with event emission",
      "integration test: stalled onboarding does not generate false completion milestones"
    ],
    validationRules: [
      "first-value milestones must be idempotent per organization",
      "milestone events require organization_id and milestone context",
      "first events must be derived from real completed actions, not page loads"
    ],
    dataQualityChecks: [
      "first milestone event counts should not exceed activated org counts",
      "event timing should match underlying record creation timestamps within tolerance",
      "first milestone duplication rate should remain very low"
    ],
    whatToMonitorAfterRelease: [
      "sudden spike in first-value events without matching record changes",
      "large gap between checklist completion and milestone event emission",
      "organizations missing milestone events despite clear activation data"
    ]
  },
  {
    area: "contract creation events",
    tests: [
      "integration test: upload, manual creation, and import-derived creation events fire with correct source",
      "integration test: denied creation attempts produce gate/denial events instead of success events",
      "integration test: contract creation events include contract_id after persistence succeeds"
    ],
    validationRules: [
      "success events require persisted contract_id and organization_id",
      "source must be one of upload, manual, or import",
      "failed or denied create attempts must never emit success create events"
    ],
    dataQualityChecks: [
      "created-contract event counts should reconcile with new contracts by source",
      "contract source distributions should match operational expectations",
      "null contract_id rate on creation success events should be zero"
    ],
    whatToMonitorAfterRelease: [
      "creation events without matching database rows",
      "manual vs upload source imbalance caused by instrumentation bugs",
      "creation-denial events spiking without corresponding entitlement changes"
    ]
  },
  {
    area: "review events",
    tests: [
      "integration test: review completion event fires only after successful review save",
      "integration test: review correction event properties reflect changed fields or correction context",
      "integration test: incomplete or failed review submissions do not emit completed-review events"
    ],
    validationRules: [
      "review-completed events require contract_id, organization_id, and resulting status",
      "review events should distinguish first review from later re-review when needed",
      "review-related events must be emitted server-side from successful mutation paths"
    ],
    dataQualityChecks: [
      "review completion events should reconcile with status transitions and reviewed timestamps",
      "duplicate review-completed events per save should remain near zero",
      "correction-heavy reviews should correlate with low-confidence records"
    ],
    whatToMonitorAfterRelease: [
      "review completions without corresponding contract state change",
      "review event duplication after retries or resubmits",
      "review event dropoff after UI or action changes"
    ]
  },
  {
    area: "reminder events",
    tests: [
      "integration test: manual reminder creation, generated reminder regeneration, send, failure, retry, rerun, and resend events fire on the right paths",
      "integration test: reminder source is captured correctly as manual or system",
      "integration test: duplicate suppression paths do not emit false send-success events"
    ],
    validationRules: [
      "reminder success/failure events require reminder_id, organization_id, and source",
      "retry and resend events must carry causal context",
      "send success events must only emit after provider-attempt result is known"
    ],
    dataQualityChecks: [
      "sent/failed event counts should reconcile with reminder and notification log state",
      "manual vs system reminder ratios should be explainable",
      "duplicate send-event rate must remain very low"
    ],
    whatToMonitorAfterRelease: [
      "send-success events without sent timestamps",
      "excess duplicate reminder events around cron runs",
      "drop in failure events despite visible operational failures"
    ]
  },
  {
    area: "digest events",
    tests: [
      "integration test: digest attempted, sent, denied, and failed events fire with correct org and trigger source",
      "integration test: manual send and cron send are distinguishable",
      "integration test: blocked plans emit denial rather than generic failure events"
    ],
    validationRules: [
      "digest events require organization_id, trigger_source, and plan context",
      "digest-sent events must only fire after actual send attempt succeeds",
      "denied events must carry denial reason such as plan or eligibility"
    ],
    dataQualityChecks: [
      "digest attempts should reconcile with digest logs or notification outputs",
      "manual vs cron digest share should match expected behavior",
      "digest denial reasons should be populated consistently"
    ],
    whatToMonitorAfterRelease: [
      "digest-sent events on ineligible plans",
      "missing digest-attempt events during known cron windows",
      "manual digest sends mislabeled as cron sends"
    ]
  },
  {
    area: "export events",
    tests: [
      "integration test: export attempted, denied, and completed events fire for CSV and XLSX",
      "integration test: export-denied events fire before download response ends",
      "integration test: successful export events include format and organization context"
    ],
    validationRules: [
      "export-completed events require export format and organization_id",
      "denied exports must include denial reason and current plan tier",
      "attempted and completed events should be distinct"
    ],
    dataQualityChecks: [
      "export-attempted vs export-completed ratios should remain plausible by plan",
      "format distribution should align with actual product usage",
      "successful export events should not appear on blocked plans"
    ],
    whatToMonitorAfterRelease: [
      "completed export events without matching allowed entitlements",
      "denied-export rate spikes after pricing or entitlement changes",
      "CSV/XLSX event drift suggesting one path lost instrumentation"
    ]
  },
  {
    area: "commercial gate events",
    tests: [
      "integration test: commercial gate shown/clicked/denied events fire on blocked actions",
      "integration test: gate events include feature, plan, and target upgrade context",
      "integration test: gate events do not fire for users already entitled to the feature"
    ],
    validationRules: [
      "gate events require feature key, current plan, and organization_id",
      "click events must follow a shown or encountered gate logically",
      "gate-denied events must be emitted server-side from actual blocked paths"
    ],
    dataQualityChecks: [
      "gate event volume should correlate with entitlement-denied logs",
      "shown-to-click ratios should stay within plausible ranges",
      "high-value gates should not have large unknown-feature buckets"
    ],
    whatToMonitorAfterRelease: [
      "gate events missing feature identifiers",
      "sudden collapse in gate-click volume after UI changes",
      "feature denials happening without matching gate event telemetry"
    ]
  },
  {
    area: "checkout and billing events",
    tests: [
      "integration test: checkout started/completed, billing portal opened, plan changed, and cancellation events fire correctly",
      "integration test: webhook-driven plan changes produce commercial events once and idempotently",
      "integration test: failed checkout does not emit checkout-completed"
    ],
    validationRules: [
      "checkout events require target plan, current plan, organization_id, and provider/source context",
      "plan change events must include previous and new plan state where available",
      "completed revenue events must come from authoritative server or webhook confirmation"
    ],
    dataQualityChecks: [
      "checkout completion should reconcile with billing provider and subscription state",
      "plan-change event counts should align with real subscription transitions",
      "duplicate completion events per organization should remain very low"
    ],
    whatToMonitorAfterRelease: [
      "checkout started without corresponding provider session creation",
      "plan-changed events outnumbering real billing changes",
      "past_due/cancelled transitions missing from analytics despite observed billing state"
    ]
  },
  {
    area: "admin/reliability events",
    tests: [
      "integration test: rerun, resend, and failure-inspection actions emit admin/reliability events with actor context",
      "integration test: processing errors and rescue attempts are attributable to org and entity",
      "integration test: unauthorized rescue attempts do not emit success-like admin events"
    ],
    validationRules: [
      "admin events require organization_id, actor role, and entity references",
      "reliability events must distinguish automatic cron paths from manual admin paths",
      "failure events must not omit severity or source stage"
    ],
    dataQualityChecks: [
      "admin rescue events should reconcile with reminder or notification state changes",
      "processing error events should align with persisted failure records",
      "unauthorized admin attempts should be rare and clearly separated"
    ],
    whatToMonitorAfterRelease: [
      "manual rescue operations happening with no analytics trace",
      "processing failures visible in admin UI but absent in analytics",
      "actor context missing on admin-triggered actions"
    ]
  },
  {
    area: "inactivity/churn signals",
    tests: [
      "integration test: inactivity signals are derived from real absence of workflow events",
      "integration test: at-risk flags do not fire for active orgs with server-side activity",
      "integration test: inactivity snapshots are idempotent and time-window aware"
    ],
    validationRules: [
      "inactivity/churn events must be derived server-side or from trusted aggregate jobs",
      "signals require organization_id, inactivity window, and missing milestone context",
      "client absence alone must not be treated as churn without workflow-state corroboration"
    ],
    dataQualityChecks: [
      "churn-risk signal counts should reconcile with account health outputs",
      "newly active orgs should age out of inactivity risk quickly",
      "inactivity event spikes should be investigated against ingestion outages"
    ],
    whatToMonitorAfterRelease: [
      "at-risk spikes caused by event ingestion regressions",
      "healthy accounts incorrectly flagged as inactive",
      "churn signals lagging far behind true inactivity windows"
    ]
  }
];

export const analyticsInstrumentationReleaseChecks = [
  "authoritative server-side commercial and review events reconcile with persisted state",
  "first-value and first-paid-value milestones fire only once per organization",
  "checkout and plan-change events match billing state transitions",
  "gate and denial events are emitted for blocked features with correct feature keys",
  "reminder send/failure/retry events reconcile with notification logs",
  "digest and export events distinguish attempt, success, and denial correctly",
  "admin rescue and reliability events include actor and organization context",
  "inactivity signals are derived from trusted workflow absence, not just missing client page views"
];

