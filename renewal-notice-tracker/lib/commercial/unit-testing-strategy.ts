export type UnitTestDomain = {
  domain: string;
  whatShouldBeUnitTested: string[];
  edgeCases: string[];
  failureCases: string[];
  highRiskBranches: string[];
  highestPriorityTests: string[];
};

export const unitTestDomains: UnitTestDomain[] = [
  {
    domain: "validation schemas",
    whatShouldBeUnitTested: [
      "contract, reminder, auth, settings, and admin schemas",
      "cross-field validation rules",
      "defaults, trims, coercions, and enum constraints"
    ],
    edgeCases: [
      "null vs empty string handling",
      "recipient lists with duplicates or spacing noise",
      "date-like values that are invalid or partially valid",
      "mixed optional and required commercial fields"
    ],
    failureCases: [
      "invalid emails passing validation",
      "bad dates being accepted silently",
      "illegal reminder offsets or units",
      "manual contract payloads missing required trust fields"
    ],
    highRiskBranches: [
      "schema refinements enforcing cross-field dependencies",
      "commercially gated fields like multi-recipient reminders",
      "date coercion and sanitization behavior"
    ],
    highestPriorityTests: [
      "reject invalid reminder recipient lists",
      "reject malformed contract dates",
      "trim and normalize valid inputs without corrupting intent"
    ]
  },
  {
    domain: "reminder date generation",
    whatShouldBeUnitTested: [
      "generateReminderRecommendations",
      "notice deadline offsets",
      "renewal reminder offsets",
      "recipient propagation and dedupe"
    ],
    edgeCases: [
      "notice date exists without expiration date",
      "expiration date exists without notice date",
      "zero or negative offset inputs",
      "multiple recipients with duplicates"
    ],
    failureCases: [
      "past reminder dates being generated incorrectly",
      "wrong number of reminders created",
      "missing reminders on notice-sensitive contracts"
    ],
    highRiskBranches: [
      "auto-renewal vs non-auto-renewal behavior",
      "notice deadline present vs derived",
      "recipient fan-out logic"
    ],
    highestPriorityTests: [
      "correct reminders when both notice and expiration dates exist",
      "safe behavior when only partial date information exists",
      "dedupe recipient emails while preserving required recipients"
    ]
  },
  {
    domain: "escalation generation",
    whatShouldBeUnitTested: [
      "buildEscalationReminders",
      "escalation offset validation",
      "escalation recipient expansion"
    ],
    edgeCases: [
      "duplicate recipients across escalation steps",
      "invalid offsets near notice date",
      "empty escalation recipient lists"
    ],
    failureCases: [
      "escalations generated out of order",
      "wrong escalation step timing",
      "duplicate escalations for the same recipient"
    ],
    highRiskBranches: [
      "strict plan-aware recipient limits",
      "offset sorting and date math"
    ],
    highestPriorityTests: [
      "escalations are ordered correctly",
      "recipient dedupe is correct across steps",
      "invalid escalation definitions fail safely"
    ]
  },
  {
    domain: "entitlement logic",
    whatShouldBeUnitTested: [
      "canUseFeature",
      "getFeatureAccessResult",
      "getContractTrackingLimitResult",
      "getAllowedReminderRecipients",
      "billing snapshot normalization"
    ],
    edgeCases: [
      "past_due subscriptions",
      "free plan at exact contract cap",
      "starter plan using growth-only collaboration features",
      "strict vs non-strict recipient enforcement"
    ],
    failureCases: [
      "paid features incorrectly exposed",
      "legitimate paid access denied",
      "contract-cap remaining count miscalculated"
    ],
    highRiskBranches: [
      "reason-aware denial handling",
      "minimum plan enforcement",
      "subscription-state overrides"
    ],
    highestPriorityTests: [
      "growth-only features blocked correctly on lower plans",
      "contract-cap edge at exact limit",
      "past_due accounts receive resolve-billing behavior"
    ]
  },
  {
    domain: "dashboard metric calculations",
    whatShouldBeUnitTested: [
      "dashboard metric derivation helpers",
      "status bucket aggregation",
      "live obligation and review counts"
    ],
    edgeCases: [
      "empty datasets",
      "mixed contract statuses",
      "contracts with partial metadata or missing dates"
    ],
    failureCases: [
      "counts drift because archived or inactive contracts are included",
      "review backlog counts understate risk",
      "status buckets double-count the same contract"
    ],
    highRiskBranches: [
      "active vs inactive contract inclusion",
      "due-soon window math",
      "status transition interpretation"
    ],
    highestPriorityTests: [
      "review backlog count correctness",
      "active contract metrics exclude inactive/archived data",
      "status aggregation produces stable buckets"
    ]
  },
  {
    domain: "import parsing/validation",
    whatShouldBeUnitTested: [
      "parseImportFile helpers where pure",
      "normalizeImportRows",
      "field trimming and date normalization",
      "recipient email normalization"
    ],
    edgeCases: [
      "Excel date serials or mixed date formats",
      "blank rows",
      "invalid notice dates with valid expiration dates",
      "duplicate column variants"
    ],
    failureCases: [
      "bad dates normalized into wrong valid dates",
      "trim/cleanup removes meaningful data",
      "duplicate rows survive normalization unexpectedly"
    ],
    highRiskBranches: [
      "date parsing fallbacks",
      "invalid-date to null coercion",
      "string cleanup paths"
    ],
    highestPriorityTests: [
      "normalize dates and trim whitespace correctly",
      "invalid dates become null rather than wrong values",
      "recipient strings remain usable after normalization"
    ]
  },
  {
    domain: "export formatting/sanitization",
    whatShouldBeUnitTested: [
      "CSV/XLSX row shaping helpers",
      "field ordering and label mapping",
      "formula injection prevention or spreadsheet sanitization"
    ],
    edgeCases: [
      "cells beginning with =, +, -, or @",
      "null metadata fields",
      "multiline notes or clause snippets"
    ],
    failureCases: [
      "spreadsheet formula injection risk",
      "wrong or missing columns",
      "date formatting drift between export types"
    ],
    highRiskBranches: [
      "sanitization of dangerous spreadsheet prefixes",
      "optional field rendering",
      "row flattening of nested evidence or recipients"
    ],
    highestPriorityTests: [
      "dangerous cell content is sanitized",
      "core exported columns are stable and ordered",
      "null and optional values do not corrupt output"
    ]
  },
  {
    domain: "ICS generation",
    whatShouldBeUnitTested: [
      "ICS event date mapping",
      "calendar field escaping",
      "summary/title construction"
    ],
    edgeCases: [
      "missing notice date or expiration date",
      "special characters in titles or counterparties",
      "multiple reminder-related dates"
    ],
    failureCases: [
      "wrong date lands in ICS output",
      "invalid ICS escaping breaks import in calendar apps",
      "timezone or all-day formatting errors"
    ],
    highRiskBranches: [
      "notice date vs renewal date event selection",
      "text escaping and line formatting"
    ],
    highestPriorityTests: [
      "ICS uses trusted reviewed dates",
      "ICS text escapes dangerous characters",
      "missing fields fail safely without corrupting the file"
    ]
  },
  {
    domain: "lifecycle/status transitions",
    whatShouldBeUnitTested: [
      "initialManualContractStatus",
      "nextReviewedContractStatus",
      "transitionContractStatus"
    ],
    edgeCases: [
      "reviewed contract with partial data",
      "manual vs extracted contract differences",
      "already terminal states"
    ],
    failureCases: [
      "illegal transitions allowed",
      "review completion leaves contract in wrong state",
      "manual contracts start in the wrong status"
    ],
    highRiskBranches: [
      "status moves gated by review completeness",
      "manual vs extracted pathways"
    ],
    highestPriorityTests: [
      "manual contracts get correct initial status",
      "reviewed contracts move into the expected next state",
      "illegal transitions are rejected or ignored safely"
    ]
  },
  {
    domain: "digest summary generation",
    whatShouldBeUnitTested: [
      "digest summary grouping and counts",
      "eligibility helpers where pure",
      "summary row shaping for upcoming obligations"
    ],
    edgeCases: [
      "no due-soon contracts",
      "mixed decision states",
      "duplicate recipients or empty billing email"
    ],
    failureCases: [
      "digest shows wrong counts",
      "irrelevant contracts appear in summary",
      "decision gaps are hidden"
    ],
    highRiskBranches: [
      "eligible vs ineligible org logic",
      "due-soon grouping rules"
    ],
    highestPriorityTests: [
      "digest summary counts are correct for mixed portfolios",
      "decision-gap items are surfaced correctly",
      "empty-state digest behavior is safe and predictable"
    ]
  },
  {
    domain: "evidence row generation",
    whatShouldBeUnitTested: [
      "buildEvidenceRows",
      "field snippet/confidence row shaping",
      "empty evidence suppression"
    ],
    edgeCases: [
      "missing confidence for a snippet",
      "confidence present without snippet",
      "multiple evidence fields with sparse data"
    ],
    failureCases: [
      "wrong field-name mapping",
      "empty evidence rows inserted",
      "confidence attached to wrong snippet"
    ],
    highRiskBranches: [
      "sparse source-snippet maps",
      "confidence defaults"
    ],
    highestPriorityTests: [
      "only valid evidence rows are generated",
      "field names and confidence values stay aligned",
      "empty evidence input yields no rows"
    ]
  },
  {
    domain: "business-impacting utilities",
    whatShouldBeUnitTested: [
      "email splitting and dedupe",
      "template offset math",
      "date utility behavior that affects obligations",
      "notification policy helpers"
    ],
    edgeCases: [
      "mixed-case duplicate emails",
      "whitespace-heavy recipient lists",
      "offsets crossing month boundaries"
    ],
    failureCases: [
      "duplicate recipients slip through",
      "offset math produces wrong deadline dates",
      "policy helper misclassifies delivery behavior"
    ],
    highRiskBranches: [
      "recipient normalization",
      "offset math with month/day boundaries"
    ],
    highestPriorityTests: [
      "email dedupe is case-insensitive and stable",
      "template offset math stays correct on boundary dates",
      "notification policy rules stay deterministic"
    ]
  },
  {
    domain: "error mapping / safe-message logic",
    whatShouldBeUnitTested: [
      "sanitizeInternalError",
      "processing error recording helpers",
      "safe user-facing error mapping"
    ],
    edgeCases: [
      "raw provider errors with sensitive content",
      "non-Error throw values",
      "nested database/provider messages"
    ],
    failureCases: [
      "internal details leak to users",
      "safe message becomes too generic to debug operationally",
      "error mapper crashes on unknown input"
    ],
    highRiskBranches: [
      "provider-specific sanitization",
      "fallback error messaging"
    ],
    highestPriorityTests: [
      "sensitive internal messages are stripped from user-facing errors",
      "unknown errors still map safely",
      "sanitized messages preserve enough context for operators"
    ]
  }
];

export const unitTestingPriorities = {
  p0: [
    "entitlement logic",
    "reminder date generation",
    "escalation generation",
    "import parsing/validation",
    "export formatting/sanitization",
    "ICS generation",
    "lifecycle/status transitions",
    "error mapping / safe-message logic"
  ],
  p1: [
    "validation schemas",
    "dashboard metric calculations",
    "digest summary generation",
    "evidence row generation"
  ],
  p2: ["business-impacting utilities not already covered indirectly"]
};

export const shouldNotBeUnitTested = [
  "pure presentation markup that has no branching business behavior",
  "framework wiring already better proven by integration or e2e tests",
  "simple pass-through wrappers around SDKs with no transformation logic",
  "long strategy-content modules whose value is structural, not behavioral",
  "full route behavior that depends on auth, DB, and providers together; use integration tests there instead"
];
