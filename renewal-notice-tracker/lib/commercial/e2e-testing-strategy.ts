export type E2eJourney = {
  journey: string;
  testGoal: string;
  steps: string[];
  assertions: string[];
  testDataNeeded: string[];
  whyItMatters: string;
  releaseCriticality: "P0" | "P1" | "P2";
};

export const e2eJourneys: E2eJourney[] = [
  {
    journey: "sign up / sign in / auth callback",
    testGoal: "Prove a real user can create an account, land in the product, and recover a valid authenticated session.",
    steps: [
      "Open the auth page from marketing",
      "Complete sign up with a fresh email",
      "Follow auth callback/redirect into the app",
      "Sign out and sign back in",
      "Refresh a protected route with an active session"
    ],
    assertions: [
      "User lands on a protected dashboard after auth callback",
      "Organization/trial context exists after signup",
      "Protected routes reject logged-out access and allow logged-in access",
      "Session survives normal page navigation and refresh"
    ],
    testDataNeeded: [
      "fresh test user email",
      "seeded auth callback test configuration",
      "workspace creation enabled in test environment"
    ],
    whyItMatters: "If auth is flaky, every downstream workflow and activation metric is misleading.",
    releaseCriticality: "P0"
  },
  {
    journey: "first-time onboarding",
    testGoal: "Verify a new workspace reaches first value through the onboarding path instead of stalling on an empty dashboard.",
    steps: [
      "Sign up into a fresh workspace",
      "Land on the dashboard",
      "Observe onboarding checklist and upgrade prompts",
      "Complete the first guided workflow steps"
    ],
    assertions: [
      "Onboarding checklist is visible for a new workspace",
      "Checklist state changes after first-value actions",
      "Upgrade messaging is contextual and not shown before value exists",
      "Dashboard reflects activation progress"
    ],
    testDataNeeded: [
      "fresh workspace",
      "deterministic onboarding/trial state"
    ],
    whyItMatters: "The product only converts if first-time users understand what successful setup looks like.",
    releaseCriticality: "P0"
  },
  {
    journey: "upload contract and review extraction",
    testGoal: "Prove the core wedge works from upload through reviewed metadata and trusted reminder state.",
    steps: [
      "Open contract upload",
      "Upload a fixture contract file",
      "Wait for extraction result or seeded extraction state",
      "Open review UI",
      "Correct/confirm extracted fields",
      "Submit review"
    ],
    assertions: [
      "Contract appears in the review queue",
      "Review form shows extracted values and evidence context",
      "Submitting review updates status and trusted metadata",
      "Due-soon/reminder-related data becomes visible after review"
    ],
    testDataNeeded: [
      "fixture PDF or DOC contract",
      "seeded extraction response with notice and expiration dates",
      "reviewable contract fixture"
    ],
    whyItMatters: "This is the highest-value workflow in the product. If it breaks, trust and retention break.",
    releaseCriticality: "P0"
  },
  {
    journey: "create manual contract",
    testGoal: "Verify customers can create a contract without extraction and still enter the operational workflow cleanly.",
    steps: [
      "Open manual contract creation",
      "Enter required metadata and dates",
      "Save the contract",
      "Open its detail page"
    ],
    assertions: [
      "Contract is created successfully",
      "Status and metadata match manual-entry expectations",
      "Contract appears in lists and detail views",
      "Commercial denial appears cleanly if plan does not allow manual creation"
    ],
    testDataNeeded: [
      "workspace on allowed plan",
      "workspace on denied plan for gate scenario"
    ],
    whyItMatters: "Manual entry is a real fallback path for teams not ready to rely fully on extraction.",
    releaseCriticality: "P1"
  },
  {
    journey: "bulk import contracts",
    testGoal: "Verify a spreadsheet-driven customer can import contracts, see job results, and understand row-level outcomes.",
    steps: [
      "Open import flow",
      "Upload a mixed-validity CSV/XLSX fixture",
      "Start import",
      "Wait for job completion",
      "Inspect created contracts and import job feedback"
    ],
    assertions: [
      "Import job record is visible",
      "Imported and failed row counts are accurate",
      "Valid rows create contracts",
      "Failed rows are reported clearly without hiding partial success",
      "Commercial limit denial appears if capacity is exceeded"
    ],
    testDataNeeded: [
      "clean CSV fixture",
      "mixed-validity CSV fixture",
      "capacity-limit fixture workspace"
    ],
    whyItMatters: "Imports are a major activation and support-risk surface. If this flow is ambiguous, support cost climbs fast.",
    releaseCriticality: "P0"
  },
  {
    journey: "assign owner and status",
    testGoal: "Prove ownership and workflow status changes are easy to apply and reflected across lists/details.",
    steps: [
      "Open a contract detail or list row action",
      "Assign an owner",
      "Update contract status",
      "Return to list/dashboard views"
    ],
    assertions: [
      "Owner persists correctly",
      "Updated status is reflected consistently",
      "Dashboard/list counts change as expected",
      "Owner gaps decrease when assignment is completed"
    ],
    testDataNeeded: [
      "workspace with at least one reviewable or active contract",
      "member list with assignable owner"
    ],
    whyItMatters: "Ownership is one of the core retention and accountability loops.",
    releaseCriticality: "P1"
  },
  {
    journey: "create reminder",
    testGoal: "Verify users can create reminders and see them attached to the contract workflow.",
    steps: [
      "Open a contract detail page",
      "Create a reminder with a valid date and recipient",
      "Save the reminder",
      "Inspect reminder list/state"
    ],
    assertions: [
      "Reminder is created successfully",
      "Reminder appears on the contract with expected date/recipient",
      "Reminder respects recipient and plan rules",
      "Reminder contributes to workflow visibility"
    ],
    testDataNeeded: [
      "contract fixture with valid dates",
      "workspace with allowed reminder configuration"
    ],
    whyItMatters: "Reminders are central to user trust and operational value.",
    releaseCriticality: "P0"
  },
  {
    journey: "apply reminder rule and escalation",
    testGoal: "Verify advanced coordination workflows are available only on the right plan and produce the expected configuration.",
    steps: [
      "Open reminder or rule configuration",
      "Add a reminder rule and escalation recipients",
      "Save the workflow",
      "Repeat on a lower-tier plan"
    ],
    assertions: [
      "Growth-capable workspace can save rule and escalation configuration",
      "Lower-tier workspace sees a clear commercial gate",
      "Saved configuration is reflected on the contract or rule UI"
    ],
    testDataNeeded: [
      "Growth workspace",
      "Starter/free workspace",
      "users to use as escalation recipients"
    ],
    whyItMatters: "This is a high-intent upgrade surface and a core monetization seam.",
    releaseCriticality: "P1"
  },
  {
    journey: "export CSV/XLSX",
    testGoal: "Verify allowed users can export trusted data safely and blocked users are denied cleanly.",
    steps: [
      "Open contracts list",
      "Trigger CSV export",
      "Trigger XLSX export",
      "Repeat from a blocked plan"
    ],
    assertions: [
      "Allowed export returns a file",
      "Exported headers and basic row data are present",
      "Blocked plan sees commercial denial instead of broken download",
      "Only current-org data is exported"
    ],
    testDataNeeded: [
      "workspace with export-enabled plan",
      "workspace with export-denied plan",
      "contracts containing representative data"
    ],
    whyItMatters: "Exports are trust-sensitive and commercial. Wrong data or entitlement bypass is dangerous.",
    releaseCriticality: "P0"
  },
  {
    journey: "open pricing and upgrade path",
    testGoal: "Verify the pricing page and upgrade CTAs route users into a coherent commercial path.",
    steps: [
      "Open marketing pricing page",
      "Click plan CTA",
      "Move through auth or dashboard upgrade context",
      "Inspect resulting checkout entry point"
    ],
    assertions: [
      "Pricing page shows plan structure and clear CTA paths",
      "Source/trial context survives into auth or app",
      "Upgrade CTA lands on expected billing flow"
    ],
    testDataNeeded: [
      "marketing entry URL with source params",
      "workspace eligible for upgrade"
    ],
    whyItMatters: "A broken pricing-to-checkout path kills monetization even if the product works well.",
    releaseCriticality: "P1"
  },
  {
    journey: "billing checkout and post-upgrade flow",
    testGoal: "Verify an upgrade changes plan state and unlocks the expected product capabilities.",
    steps: [
      "Start from a lower-tier workspace",
      "Trigger checkout from a gate or settings",
      "Complete mocked checkout",
      "Return to the app",
      "Use a newly unlocked feature"
    ],
    assertions: [
      "Plan state updates after checkout completion",
      "Previously gated feature becomes available",
      "Settings/billing UI reflects upgraded plan",
      "Upgrade prompts disappear or change appropriately"
    ],
    testDataNeeded: [
      "billing-provider test harness or mocked checkout completion",
      "starter/free workspace",
      "growth-only feature fixture"
    ],
    whyItMatters: "This is the direct path to revenue realization and must be release-safe.",
    releaseCriticality: "P0"
  },
  {
    journey: "send monthly digest",
    testGoal: "Verify digest configuration and dispatch behavior are visible and operationally trustworthy.",
    steps: [
      "Enable digest-capable settings",
      "Seed due-soon contract data",
      "Trigger digest send path in staging/test mode",
      "Inspect admin/debug or send result view"
    ],
    assertions: [
      "Eligible workspace can trigger/send digest flow",
      "Digest summary reflects due-soon and decision-gap data",
      "Ineligible plan/workspace is blocked cleanly"
    ],
    testDataNeeded: [
      "workspace with digest-eligible plan",
      "contracts due soon",
      "notification sink or preview transport"
    ],
    whyItMatters: "Digest trust drives ongoing visibility and retention for managers and admins.",
    releaseCriticality: "P1"
  },
  {
    journey: "admin debug actions",
    testGoal: "Verify admins can inspect and rescue failed operational workflows without exposing dangerous actions broadly.",
    steps: [
      "Open admin/debug panel as admin",
      "Inspect failed reminders or extraction failures",
      "Trigger rerun or resend action",
      "Repeat as non-admin"
    ],
    assertions: [
      "Admin sees debug panels and rescue actions",
      "Rescue action is available and changes visible state",
      "Non-admin cannot access admin/debug functions"
    ],
    testDataNeeded: [
      "admin user",
      "non-admin member",
      "seeded failed reminder or notification log"
    ],
    whyItMatters: "Admin rescue tools are high-power surfaces that affect trust and multi-tenant safety.",
    releaseCriticality: "P0"
  },
  {
    journey: "permission restrictions by role",
    testGoal: "Verify members and admins see only the actions their role should allow.",
    steps: [
      "Sign in as admin",
      "Observe access to settings, billing, and admin screens",
      "Sign in as member",
      "Try the same routes and actions"
    ],
    assertions: [
      "Admin can access org-wide settings and admin surfaces",
      "Member is blocked from restricted mutations and screens",
      "Commercial and operational actions honor role boundaries"
    ],
    testDataNeeded: [
      "admin user",
      "member user in same org"
    ],
    whyItMatters: "Role leakage creates trust, security, and support problems immediately.",
    releaseCriticality: "P0"
  },
  {
    journey: "contract filtering and detail workflow",
    testGoal: "Verify users can find contracts, inspect detail, and move between list and detail without workflow breakage.",
    steps: [
      "Open contract list",
      "Apply filters",
      "Open a contract detail",
      "Return to list and refine filters"
    ],
    assertions: [
      "Filters narrow the contract set correctly",
      "Selected contract detail shows expected metadata",
      "Navigation between list/detail is stable",
      "Empty and filtered states are understandable"
    ],
    testDataNeeded: [
      "seeded contract portfolio with varied statuses and dates"
    ],
    whyItMatters: "If users cannot reliably inspect and segment the portfolio, operational adoption weakens.",
    releaseCriticality: "P1"
  },
  {
    journey: "renewal decision and notes",
    testGoal: "Verify users can record renewal decisions and notes as part of the operating workflow.",
    steps: [
      "Open contract detail",
      "Record a renewal decision and note",
      "Save the update",
      "Inspect decision-related views or counts"
    ],
    assertions: [
      "Decision and notes persist",
      "Decision state appears in detail and summary views",
      "Decision gaps reduce after update"
    ],
    testDataNeeded: [
      "due-soon contract fixture",
      "workspace with decision tracking enabled"
    ],
    whyItMatters: "Decision logging is one of the clearest signals of embedded operational workflow.",
    releaseCriticality: "P1"
  },
  {
    journey: "playbook attachment and step completion",
    testGoal: "Verify playbooks can be attached to contract workflows and progress can be updated by users.",
    steps: [
      "Open a contract or workflow view",
      "Attach/select a playbook",
      "Open playbook steps",
      "Mark a step complete"
    ],
    assertions: [
      "Playbook attachment persists",
      "Attached playbook is visible on the workflow",
      "Step completion updates visible progress/state"
    ],
    testDataNeeded: [
      "workspace with available playbook fixture",
      "contract eligible for playbook attachment"
    ],
    whyItMatters: "Playbooks are part of the deeper operational coordination layer and need trustable workflow behavior.",
    releaseCriticality: "P2"
  }
];

export const e2eTestingPriorities = {
  p0: [
    "sign up / sign in / auth callback",
    "first-time onboarding",
    "upload contract and review extraction",
    "bulk import contracts",
    "create reminder",
    "export CSV/XLSX",
    "billing checkout and post-upgrade flow",
    "admin debug actions",
    "permission restrictions by role"
  ],
  p1: [
    "create manual contract",
    "assign owner and status",
    "apply reminder rule and escalation",
    "open pricing and upgrade path",
    "send monthly digest",
    "contract filtering and detail workflow",
    "renewal decision and notes"
  ],
  p2: ["playbook attachment and step completion"]
};

