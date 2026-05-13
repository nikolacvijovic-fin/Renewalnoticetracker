export type IntegrationTestFlow = {
  flow: string;
  systemBoundariesInvolved: string[];
  whatShouldBeMockedVsReal: string[];
  testCases: string[];
  edgeCases: string[];
  trustRisks: string[];
  highestPriorityIntegrationTests: string[];
};

export const integrationTestingFlows: IntegrationTestFlow[] = [
  {
    flow: "auth with Supabase session handling",
    systemBoundariesInvolved: [
      "Next.js route and server action guards",
      "Supabase auth/session lookup",
      "organization membership resolution",
      "trial and attribution bootstrapping"
    ],
    whatShouldBeMockedVsReal: [
      "Mock Supabase auth responses and membership records for deterministic roles and session states",
      "Keep route/action guard logic real",
      "Do not hit real external auth providers in integration tests"
    ],
    testCases: [
      "authenticated user can access protected workspace routes",
      "unauthenticated request is rejected or redirected correctly",
      "signup flow creates org context with trial metadata",
      "member vs admin sees correct settings and admin access"
    ],
    edgeCases: [
      "expired or malformed session cookies",
      "valid user without active org membership",
      "membership exists in another org only"
    ],
    trustRisks: [
      "unauthorized access to workspace data",
      "cross-org leakage through session confusion",
      "broken onboarding because org bootstrap fails silently"
    ],
    highestPriorityIntegrationTests: [
      "protected route rejects unauthenticated access",
      "admin-only route blocks non-admin member",
      "signup creates organization and initial trial context"
    ]
  },
  {
    flow: "contract creation and metadata persistence",
    systemBoundariesInvolved: [
      "server actions",
      "validation schemas",
      "database persistence",
      "contract status and metadata shaping"
    ],
    whatShouldBeMockedVsReal: [
      "Keep validation, persistence shaping, and lifecycle logic real",
      "Mock external extraction dependencies when creation path does not require them"
    ],
    testCases: [
      "manual contract creation persists normalized metadata",
      "creation respects contract-cap entitlements",
      "created contracts land in expected lifecycle state",
      "owner and reminder-related metadata round-trips correctly"
    ],
    edgeCases: [
      "partial dates or optional metadata fields",
      "duplicate counterparties",
      "creation at exact plan limit"
    ],
    trustRisks: [
      "contracts created with wrong status",
      "commercial limit bypass",
      "metadata corruption that later breaks reminders or exports"
    ],
    highestPriorityIntegrationTests: [
      "manual creation persists expected normalized contract row",
      "manual creation is denied cleanly at plan limit",
      "initial status is correct for manual contracts"
    ]
  },
  {
    flow: "upload/storage/extraction pipeline",
    systemBoundariesInvolved: [
      "file upload action",
      "storage path handling",
      "extraction pipeline",
      "processing error persistence",
      "review queue state"
    ],
    whatShouldBeMockedVsReal: [
      "Mock storage adapter and extraction provider responses",
      "Keep upload action, persistence, status updates, and failure recording real",
      "Do not call real AI extraction services"
    ],
    testCases: [
      "uploaded file creates contract and extraction work item",
      "successful extraction persists structured metadata and confidence context",
      "failed extraction records processing error and leaves contract reviewable",
      "contract capacity is enforced before extraction work begins"
    ],
    edgeCases: [
      "unsupported or malformed files",
      "storage write succeeds but extraction fails",
      "repeated upload attempt for same source file"
    ],
    trustRisks: [
      "silent extraction failure",
      "file stored but contract never becomes reviewable",
      "wrong extraction result treated as trusted data"
    ],
    highestPriorityIntegrationTests: [
      "upload success writes contract and extraction metadata",
      "extraction failure is visible in processing errors",
      "upload denied at contract cap before expensive pipeline work starts"
    ]
  },
  {
    flow: "review updates and reminder regeneration",
    systemBoundariesInvolved: [
      "review action",
      "review validation",
      "contract lifecycle updates",
      "system reminder generation and persistence",
      "evidence row generation"
    ],
    whatShouldBeMockedVsReal: [
      "Keep review action, lifecycle logic, evidence generation, and reminder regeneration real",
      "Mock downstream notification sending; this flow should stop at persisted reminders"
    ],
    testCases: [
      "review submission updates contract metadata and evidence rows",
      "review completion transitions status correctly",
      "reviewed dates regenerate expected system reminders",
      "re-review replaces stale generated reminders safely"
    ],
    edgeCases: [
      "partial reviewed data",
      "review changes notice date materially",
      "existing manual reminders coexist with regenerated system reminders"
    ],
    trustRisks: [
      "reviewed contract shows trusted data but reminders remain stale",
      "manual reminders accidentally deleted",
      "evidence no longer matches reviewed values"
    ],
    highestPriorityIntegrationTests: [
      "review updates contract and regenerates system reminders",
      "changing reviewed dates replaces stale generated reminders only",
      "manual reminders survive review regeneration"
    ]
  },
  {
    flow: "billing and entitlements",
    systemBoundariesInvolved: [
      "checkout and manage routes",
      "billing provider abstraction",
      "webhook processing",
      "entitlement resolution",
      "commercial gate responses in actions and routes"
    ],
    whatShouldBeMockedVsReal: [
      "Mock external billing providers and webhook signatures/payloads",
      "Keep webhook handling, entitlement derivation, and denial logic real"
    ],
    testCases: [
      "checkout route creates billing session with expected plan context",
      "webhook updates subscription state and entitlements",
      "past_due state changes access behavior correctly",
      "gated feature requests return commercial denial with expected reason"
    ],
    edgeCases: [
      "duplicate webhook delivery",
      "unknown plan identifiers",
      "plan downgrade while usage exceeds new limits"
    ],
    trustRisks: [
      "paying customer loses access incorrectly",
      "free customer gets paid features",
      "billing state drifts from entitlement state"
    ],
    highestPriorityIntegrationTests: [
      "webhook transitions plan state idempotently",
      "checkout route encodes correct target plan and source",
      "gated action denies correctly after downgrade or past_due state"
    ]
  },
  {
    flow: "imports and job tracking",
    systemBoundariesInvolved: [
      "import action",
      "file parsing and normalization",
      "job tracking persistence",
      "row-level error reporting",
      "contract creation and plan limits"
    ],
    whatShouldBeMockedVsReal: [
      "Keep parsing, normalization, job tracking, and persistence real",
      "Use local fixture files instead of real cloud storage",
      "Do not call external services"
    ],
    testCases: [
      "successful import creates job record and expected contracts",
      "partial failure import records row errors and imported counts",
      "import respects plan contract cap",
      "duplicate/invalid rows do not silently disappear"
    ],
    edgeCases: [
      "mixed valid and invalid rows",
      "blank rows and weird column aliases",
      "capacity reached mid-import"
    ],
    trustRisks: [
      "job says success while rows were dropped",
      "wrong dates imported from mixed formats",
      "customer cannot tell what failed and what persisted"
    ],
    highestPriorityIntegrationTests: [
      "partial-success import reports correct counts and errors",
      "capacity enforcement stops import safely and transparently",
      "job status reflects final outcome accurately"
    ]
  },
  {
    flow: "digest send flows",
    systemBoundariesInvolved: [
      "digest eligibility logic",
      "cron route",
      "organization settings and plan checks",
      "summary generation",
      "notification dispatch logging"
    ],
    whatShouldBeMockedVsReal: [
      "Mock outbound notification delivery",
      "Keep cron auth, eligibility checks, summary shaping, and send-attempt logging real"
    ],
    testCases: [
      "eligible org receives digest send attempt with correct summary payload",
      "ineligible org is skipped cleanly",
      "digest action records attempt outcomes for operators"
    ],
    edgeCases: [
      "org has no due-soon items",
      "digest enabled but plan does not allow it",
      "multiple admins with mixed email states"
    ],
    trustRisks: [
      "digest sent to wrong org or wrong recipient",
      "digest hides critical decision gaps",
      "digest appears enabled but never sends"
    ],
    highestPriorityIntegrationTests: [
      "digest cron skips ineligible orgs and sends for eligible ones",
      "digest summary content reflects due-soon and decision-gap data",
      "failed digest attempt is logged visibly"
    ]
  },
  {
    flow: "reminder cron processing",
    systemBoundariesInvolved: [
      "cron authorization route",
      "reminder selection query",
      "notification policy",
      "send attempt logging",
      "status transition and next retry handling"
    ],
    whatShouldBeMockedVsReal: [
      "Mock downstream email/chat providers",
      "Keep cron route, reminder processing, state transitions, and logs real"
    ],
    testCases: [
      "authorized cron processes due reminders and records sends",
      "unauthorized cron request is rejected",
      "successful send updates reminder status correctly",
      "failed send records retry state and visible errors"
    ],
    edgeCases: [
      "mixed reminder statuses in same run",
      "already-sent reminder included in candidate set",
      "missing destination or provider-specific delivery failure"
    ],
    trustRisks: [
      "missed reminders",
      "duplicate sends",
      "operator cannot see failed reminders or retry timing"
    ],
    highestPriorityIntegrationTests: [
      "authorized cron processes only due pending reminders",
      "failed reminder send records retry metadata",
      "unauthorized cron access is rejected quickly"
    ]
  },
  {
    flow: "retry and duplicate-suppression flows",
    systemBoundariesInvolved: [
      "reminder processing state machine",
      "retry scheduling",
      "notification log history",
      "duplicate suppression checks",
      "admin rerun tooling"
    ],
    whatShouldBeMockedVsReal: [
      "Mock outbound providers",
      "Keep retry math, duplicate checks, reminder state transitions, and admin rerun behavior real"
    ],
    testCases: [
      "failed reminder is retried according to retry policy",
      "already-sent reminder is not re-sent by duplicate processing",
      "admin rerun creates one controlled resend path",
      "duplicate notification log entries do not trigger extra sends"
    ],
    edgeCases: [
      "same reminder processed twice in quick succession",
      "manual rerun overlaps with scheduled retry",
      "notification succeeded after transient provider timeout"
    ],
    trustRisks: [
      "customers get duplicate reminders",
      "failed reminders never recover",
      "admin rescue creates more duplicates"
    ],
    highestPriorityIntegrationTests: [
      "duplicate suppression prevents second send on already-sent reminder",
      "retry flow moves reminder into expected next state",
      "admin rerun is safe and auditable"
    ]
  },
  {
    flow: "exports",
    systemBoundariesInvolved: [
      "route auth",
      "entitlements",
      "contract query and formatting helpers",
      "download response shaping"
    ],
    whatShouldBeMockedVsReal: [
      "Keep route auth, entitlement checks, query shaping, and export formatting real",
      "No external providers required"
    ],
    testCases: [
      "allowed plan can export CSV and XLSX with expected fields",
      "blocked plan receives denial and audit event",
      "only org-owned contracts appear in export payload"
    ],
    edgeCases: [
      "dangerous spreadsheet cell prefixes",
      "missing optional metadata",
      "empty export result set"
    ],
    trustRisks: [
      "wrong or unsafe exported data",
      "cross-tenant export leakage",
      "commercial gate bypass"
    ],
    highestPriorityIntegrationTests: [
      "export route enforces org scoping",
      "export route denies blocked plan correctly",
      "formatted output preserves stable required columns"
    ]
  },
  {
    flow: "settings persistence",
    systemBoundariesInvolved: [
      "settings action",
      "validation",
      "organization persistence",
      "billing and digest-related settings interpretation"
    ],
    whatShouldBeMockedVsReal: [
      "Keep validation and persistence real",
      "Mock billing portal/session creation if settings page links into billing"
    ],
    testCases: [
      "settings save persists normalized organization preferences",
      "digest and reminder preferences round-trip correctly",
      "billing-related settings UI respects plan and subscription state"
    ],
    edgeCases: [
      "blank optional fields",
      "invalid email or recipient values",
      "non-admin attempting settings mutation"
    ],
    trustRisks: [
      "settings appear saved but do not affect behavior",
      "non-admin can mutate org-wide config",
      "digest/reminder configuration becomes inconsistent"
    ],
    highestPriorityIntegrationTests: [
      "admin can persist org settings and non-admin cannot",
      "digest configuration persists and reflects in eligibility behavior",
      "invalid settings payload is rejected safely"
    ]
  },
  {
    flow: "org/membership/role behavior",
    systemBoundariesInvolved: [
      "membership lookup",
      "role-based guards",
      "settings/admin screens",
      "contract access queries",
      "export and debug routes"
    ],
    whatShouldBeMockedVsReal: [
      "Keep org scoping, role checks, and route/action behavior real",
      "Mock auth/session resolution as needed to create role permutations"
    ],
    testCases: [
      "member cannot access admin/debug features",
      "org scoping applies to contract queries and exports",
      "role changes alter access without stale capability leaks"
    ],
    edgeCases: [
      "user belongs to multiple orgs",
      "membership removed mid-session",
      "debug route accessed by non-admin"
    ],
    trustRisks: [
      "cross-tenant data exposure",
      "admin/debug misuse",
      "stale membership allows unauthorized actions"
    ],
    highestPriorityIntegrationTests: [
      "cross-org access is denied on exports and contract reads",
      "admin/debug route blocks non-admin member",
      "multi-org user only sees active org data"
    ]
  }
];

export const integrationTestingPriorities = {
  p0: [
    "review updates and reminder regeneration",
    "billing and entitlements",
    "imports and job tracking",
    "reminder cron processing",
    "retry and duplicate-suppression flows",
    "org/membership/role behavior"
  ],
  p1: [
    "auth with Supabase session handling",
    "upload/storage/extraction pipeline",
    "exports",
    "settings persistence",
    "digest send flows"
  ],
  p2: ["contract creation and metadata persistence where already heavily covered transitively"]
};

