export type CommercialTestArea = {
  area: string;
  coreTests: string[];
  edgeCases: string[];
  failureCases: string[];
  highestRiskCommercialBugs: string[];
  mustBlockRelease: string[];
};

export const commercialTestingAreas: CommercialTestArea[] = [
  {
    area: "pricing page behavior",
    coreTests: [
      "pricing page renders current plan structure and CTA targets",
      "pricing links preserve source/attribution context into auth or checkout path",
      "plan comparisons reflect actual gating and value-metric language"
    ],
    edgeCases: [
      "signed-out vs signed-in visitor",
      "current customer opening pricing page while already on a paid plan",
      "stale marketing copy after plan configuration changes"
    ],
    failureCases: [
      "CTA points to wrong plan or wrong billing flow",
      "pricing page promises features not actually unlocked",
      "source attribution is dropped before checkout"
    ],
    highestRiskCommercialBugs: [
      "pricing page misstates plans and sets false expectations",
      "users are routed into the wrong upgrade path",
      "marketing copy drifts from entitlement reality"
    ],
    mustBlockRelease: [
      "wrong plan CTA destinations",
      "pricing page promises mismatched with actual entitlement logic"
    ]
  },
  {
    area: "checkout session creation",
    coreTests: [
      "allowed admin can create checkout session for valid target plan",
      "checkout session includes plan and source context",
      "post-checkout return path brings user back into app cleanly"
    ],
    edgeCases: [
      "repeat checkout attempts",
      "upgrade from each lower plan to higher plan",
      "checkout request from stale billing state"
    ],
    failureCases: [
      "session created for wrong plan",
      "non-admin can open checkout",
      "provider creation failure returns unsafe or misleading error"
    ],
    highestRiskCommercialBugs: [
      "customer pays for wrong plan",
      "billing session succeeds but app cannot reconcile target plan",
      "checkout errors strand high-intent users"
    ],
    mustBlockRelease: [
      "wrong target plan in checkout session",
      "non-admin checkout access",
      "broken post-checkout return path"
    ]
  },
  {
    area: "invalid plan handling",
    coreTests: [
      "unknown or deprecated plan identifiers are rejected safely",
      "invalid plan requests do not create checkout sessions",
      "invalid plan state returns stable, operator-safe error messaging"
    ],
    edgeCases: [
      "typoed plan identifiers from URLs or client state",
      "old links to deprecated plans",
      "provider webhook references unknown plan mapping"
    ],
    failureCases: [
      "unknown plan silently falls back to another plan",
      "invalid plan creates a partially valid billing state",
      "error response exposes internal billing mapping details"
    ],
    highestRiskCommercialBugs: [
      "users buy or are granted the wrong tier",
      "billing state becomes unrecoverably inconsistent",
      "operators cannot diagnose unknown-plan incidents"
    ],
    mustBlockRelease: [
      "invalid plan fallback to a real paid plan",
      "unknown-plan webhook corrupting subscription state"
    ]
  },
  {
    area: "owner/admin-only billing access",
    coreTests: [
      "admin can open checkout and billing portal",
      "member/non-admin cannot access billing routes or mutations",
      "billing UI hides restricted controls and backend rejects direct access"
    ],
    edgeCases: [
      "role changed between page load and mutation",
      "multi-org admin using different active org",
      "member visiting saved billing URLs"
    ],
    failureCases: [
      "member can manage subscription",
      "cross-org billing route targets wrong organization",
      "hidden UI without backend denial"
    ],
    highestRiskCommercialBugs: [
      "unauthorized billing changes",
      "org-level subscription managed by wrong user",
      "security and trust breach on financial controls"
    ],
    mustBlockRelease: [
      "non-admin billing route access",
      "cross-org billing management"
    ]
  },
  {
    area: "payment webhook synchronization",
    coreTests: [
      "webhook event updates subscription state idempotently",
      "successful payment activates correct plan",
      "cancellation or status change updates entitlement snapshot"
    ],
    edgeCases: [
      "duplicate webhook delivery",
      "out-of-order status events",
      "provider retries after app-side timeout"
    ],
    failureCases: [
      "webhook accepted but subscription state not updated",
      "duplicate webhook causes duplicate or conflicting updates",
      "wrong org is updated from webhook payload"
    ],
    highestRiskCommercialBugs: [
      "paying customer remains blocked",
      "cancelled customer retains paid access",
      "billing and entitlement state drift apart"
    ],
    mustBlockRelease: [
      "webhook cannot activate paid customer correctly",
      "webhook idempotency failure",
      "wrong-org subscription updates"
    ]
  },
  {
    area: "entitlement enforcement",
    coreTests: [
      "entitlement helpers return correct access by plan and status",
      "actions and routes enforce entitlement checks consistently",
      "contract-cap enforcement matches active tracked contract logic"
    ],
    edgeCases: [
      "exact contract cap boundary",
      "past_due account with previously unlocked features",
      "downgraded account still above new usage cap"
    ],
    failureCases: [
      "blocked feature becomes available",
      "allowed feature is denied incorrectly",
      "different routes interpret the same plan differently"
    ],
    highestRiskCommercialBugs: [
      "revenue leakage from free access to paid workflows",
      "churn from false denials on paying customers",
      "inconsistent entitlements across surfaces"
    ],
    mustBlockRelease: [
      "paid feature bypass on lower plans",
      "paying customer denied entitled core feature"
    ]
  },
  {
    area: "commercial denial flows",
    coreTests: [
      "blocked actions return clear commercial denial reason",
      "denial surfaces show correct upgrade path",
      "denials are logged or auditable for commercial analysis"
    ],
    edgeCases: [
      "denial on exact cap boundary",
      "past_due denial vs lower-plan denial",
      "denial after stale client state"
    ],
    failureCases: [
      "generic error shown instead of commercial denial",
      "wrong upgrade target suggested",
      "denied action still mutates data partially"
    ],
    highestRiskCommercialBugs: [
      "high-intent users hit confusing dead ends",
      "commercial denials are mistaken for product failures",
      "partial writes happen before denial"
    ],
    mustBlockRelease: [
      "denied feature still mutates state",
      "wrong upgrade recommendation on core gates"
    ]
  },
  {
    area: "export gating",
    coreTests: [
      "export allowed for entitled plan",
      "export denied for blocked plan with correct messaging",
      "export denial is consistent across CSV and XLSX"
    ],
    edgeCases: [
      "plan changes while export page is open",
      "empty dataset export on allowed plan",
      "member vs admin behavior if export permissions differ"
    ],
    failureCases: [
      "blocked plan downloads export anyway",
      "allowed plan gets denial or broken response",
      "CSV and XLSX disagree on gating"
    ],
    highestRiskCommercialBugs: [
      "paid reporting value leaks to free/lower plans",
      "paying customers lose access to a core reporting workflow"
    ],
    mustBlockRelease: [
      "export bypass on blocked plan",
      "false denial on entitled plan"
    ]
  },
  {
    area: "digest gating",
    coreTests: [
      "digest-eligible plan can configure and send digest flow",
      "blocked plan sees commercial denial instead of silent failure",
      "digest cron respects plan status and org settings"
    ],
    edgeCases: [
      "no due-soon items",
      "past_due subscription with digest previously enabled",
      "digest enabled before downgrade"
    ],
    failureCases: [
      "blocked plan continues receiving digest",
      "eligible plan silently stops sending digest",
      "digest denial appears as generic operational failure"
    ],
    highestRiskCommercialBugs: [
      "recurring paid feature leaks after downgrade",
      "retention feature disappears for paying accounts without explanation"
    ],
    mustBlockRelease: [
      "digest sends on blocked plan",
      "eligible plan denied without status-based justification"
    ]
  },
  {
    area: "manual contract gating",
    coreTests: [
      "allowed plan can create manual contract",
      "blocked plan sees commercial denial with upgrade path",
      "manual contract creation also respects contract-cap limits"
    ],
    edgeCases: [
      "manual create at exact contract cap",
      "plan upgraded or downgraded mid-session",
      "member role vs admin role if policy differs"
    ],
    failureCases: [
      "manual contract created on blocked plan",
      "manual create denial after partial data persistence",
      "cap enforcement differs from upload/import flows"
    ],
    highestRiskCommercialBugs: [
      "revenue leakage on a clear paid workflow",
      "trust damage from ghost contracts after denial"
    ],
    mustBlockRelease: [
      "manual contract bypass on blocked plan",
      "partial persistence on denied create"
    ]
  },
  {
    area: "multi-recipient reminder gating",
    coreTests: [
      "Growth-capable plan can save multiple recipients",
      "lower tier is capped or denied correctly",
      "strict recipient limit enforcement is consistent across UI and backend"
    ],
    edgeCases: [
      "duplicate recipients collapse under allowed limit",
      "recipient count exactly at limit",
      "existing multi-recipient reminder after downgrade"
    ],
    failureCases: [
      "lower plan stores too many recipients",
      "allowed plan is blocked by overly strict validation",
      "UI says allowed but backend rejects, or vice versa"
    ],
    highestRiskCommercialBugs: [
      "coordination-heavy paid value leaks to lower plans",
      "high-intent upgrade path feels broken due to inconsistent recipient checks"
    ],
    mustBlockRelease: [
      "recipient-limit bypass on lower tiers",
      "inconsistent frontend/backend gating"
    ]
  },
  {
    area: "billing portal behavior",
    coreTests: [
      "admin can open billing portal for current org",
      "billing portal request is logged with source context",
      "non-admin and wrong-org users are denied"
    ],
    edgeCases: [
      "subscription inactive or cancelled",
      "billing portal requested repeatedly",
      "active org changed shortly before request"
    ],
    failureCases: [
      "portal opens for wrong org",
      "denied user gets portal link",
      "error handling strands customer with no recovery path"
    ],
    highestRiskCommercialBugs: [
      "wrong customer manages wrong subscription",
      "paying admin cannot self-serve plan management"
    ],
    mustBlockRelease: [
      "wrong-org billing portal access",
      "non-admin billing portal access"
    ]
  },
  {
    area: "subscription status edge cases",
    coreTests: [
      "active status unlocks entitled features",
      "inactive/cancelled status removes paid access as designed",
      "past_due status triggers resolve-billing behavior rather than silent failure"
    ],
    edgeCases: [
      "status transition during active session",
      "cancelled but still within paid-through period if supported",
      "reactivation after past_due or cancellation"
    ],
    failureCases: [
      "cancelled account retains paid access indefinitely",
      "active account is treated as inactive",
      "past_due account receives no guidance and sees generic failures"
    ],
    highestRiskCommercialBugs: [
      "state drift causes both revenue leakage and false denials",
      "customers lose trust because access changes are inconsistent or invisible"
    ],
    mustBlockRelease: [
      "active plan treated as inactive",
      "cancelled plan still fully entitled",
      "past_due status not reflected in gating behavior"
    ]
  }
];

export const commercialReleaseBlockers = [
  "Wrong checkout target plan or wrong post-checkout return path.",
  "Non-admin access to billing checkout or billing portal.",
  "Webhook synchronization fails to activate, downgrade, or cancel entitlements correctly.",
  "Paid feature bypass on lower plans.",
  "Paying customer falsely denied entitled access.",
  "Commercial denial mutates state partially before blocking.",
  "Export or manual contract gating bypass.",
  "Multi-recipient reminder gating inconsistent between frontend and backend.",
  "Cancelled or past_due subscription state handled incorrectly.",
  "Wrong organization billing or entitlement update."
];

