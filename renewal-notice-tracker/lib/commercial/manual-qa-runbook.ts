export type ManualQaRunbookSection = {
  checklist: string;
  items: Array<{
    title: string;
    steps: string[];
    expectedResult: string;
    severityIfBroken: "P0" | "P1" | "P2";
    blocksRelease: boolean;
  }>;
};

export const manualQaRunbook: ManualQaRunbookSection[] = [
  {
    checklist: "smoke test checklist",
    items: [
      {
        title: "auth and dashboard load",
        steps: [
          "Sign in with a valid internal test user.",
          "Load the main dashboard.",
          "Refresh the page once after load."
        ],
        expectedResult:
          "User lands in the correct org, dashboard renders without error, and session survives refresh.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "contract list and detail open",
        steps: [
          "Open the contracts list.",
          "Open a known contract from the list.",
          "Return to the list."
        ],
        expectedResult:
          "Contracts list loads, detail page opens with expected metadata, and navigation remains stable.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "create contract entry point",
        steps: [
          "Open the create contract page.",
          "Verify upload and manual entry options are visible.",
          "Return without saving."
        ],
        expectedResult:
          "Create-contract surface loads and both main intake paths are visible and usable.",
        severityIfBroken: "P1",
        blocksRelease: false
      }
    ]
  },
  {
    checklist: "release regression checklist",
    items: [
      {
        title: "critical workflow pass",
        steps: [
          "Upload or open a seeded contract.",
          "Review or edit key fields.",
          "Verify resulting reminder/workflow state."
        ],
        expectedResult:
          "Core renewal workflow still works end-to-end with no trust-breaking regressions.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "commercial path pass",
        steps: [
          "Open pricing or settings billing surface.",
          "Trigger an upgrade CTA.",
          "Verify checkout/billing path opens correctly."
        ],
        expectedResult:
          "Upgrade path is reachable and commercially coherent.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "admin rescue visibility",
        steps: [
          "Open admin/debug area with seeded failures.",
          "Inspect failed reminder or notification data.",
          "Verify rescue actions are present."
        ],
        expectedResult:
          "Operators can still diagnose and act on known failures.",
        severityIfBroken: "P1",
        blocksRelease: false
      }
    ]
  },
  {
    checklist: "billing checklist",
    items: [
      {
        title: "admin-only checkout access",
        steps: [
          "Log in as admin and open billing/upgrade.",
          "Repeat as non-admin member."
        ],
        expectedResult:
          "Admin can access checkout path; non-admin cannot manage billing.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "plan state visibility",
        steps: [
          "Open settings or billing view for a trial or paid org.",
          "Inspect current plan, trial, or billing state."
        ],
        expectedResult:
          "Current commercial state is visible and consistent with expected org plan.",
        severityIfBroken: "P1",
        blocksRelease: false
      },
      {
        title: "billing portal path",
        steps: [
          "Open the billing portal link as admin on a paid org.",
          "Verify route opens correctly."
        ],
        expectedResult:
          "Billing portal opens for the correct org without error.",
        severityIfBroken: "P0",
        blocksRelease: true
      }
    ]
  },
  {
    checklist: "permissions checklist",
    items: [
      {
        title: "cross-org contract access denied",
        steps: [
          "Use a user with access to one org only.",
          "Attempt to access another org's contract detail URL directly."
        ],
        expectedResult:
          "Access is denied and no cross-org data is shown.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "admin/debug role protection",
        steps: [
          "Open admin/debug as admin.",
          "Repeat with a non-admin member."
        ],
        expectedResult:
          "Admin sees debug tools; member is denied.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "settings mutation protection",
        steps: [
          "Change an org setting as admin.",
          "Attempt the same as member."
        ],
        expectedResult:
          "Admin can save; member cannot mutate org-wide settings.",
        severityIfBroken: "P0",
        blocksRelease: true
      }
    ]
  },
  {
    checklist: "reminder reliability checklist",
    items: [
      {
        title: "manual reminder create",
        steps: [
          "Open a contract with valid dates.",
          "Create a reminder with a valid recipient."
        ],
        expectedResult:
          "Reminder is saved and appears with expected date and recipient.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "failed reminder visibility",
        steps: [
          "Use seeded failed reminder data.",
          "Open admin/debug view."
        ],
        expectedResult:
          "Failed reminder is visible with error and retry context.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "rerun/resend safety",
        steps: [
          "Trigger rerun on a failed reminder or resend on a failed notification.",
          "Inspect resulting state."
        ],
        expectedResult:
          "Action is traceable, safe, and does not create obvious duplicate behavior.",
        severityIfBroken: "P0",
        blocksRelease: true
      }
    ]
  },
  {
    checklist: "import/export checklist",
    items: [
      {
        title: "mixed-validity import",
        steps: [
          "Import a fixture file with valid and invalid rows.",
          "Inspect import job results."
        ],
        expectedResult:
          "Import job shows correct imported/failed counts and valid rows persist.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "export CSV and XLSX",
        steps: [
          "Export CSV from an entitled org.",
          "Export XLSX from the same org.",
          "Open files."
        ],
        expectedResult:
          "Files download successfully with correct core data and safe formatting.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "export denial",
        steps: [
          "Attempt export from a blocked plan."
        ],
        expectedResult:
          "User sees a commercial denial instead of a broken or successful download.",
        severityIfBroken: "P1",
        blocksRelease: false
      }
    ]
  },
  {
    checklist: "extraction/review checklist",
    items: [
      {
        title: "extraction review flow",
        steps: [
          "Upload a seeded contract with extraction output.",
          "Open review screen.",
          "Inspect dates, confidence, and evidence."
        ],
        expectedResult:
          "Review screen clearly shows extracted values, uncertainty, and source evidence.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "manual correction persistence",
        steps: [
          "Correct an extracted date during review.",
          "Save the review.",
          "Reload the contract detail."
        ],
        expectedResult:
          "Corrected values persist and become the visible canonical values.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "post-review reminder regeneration",
        steps: [
          "Review a contract with changed dates.",
          "Inspect generated reminders afterward."
        ],
        expectedResult:
          "System reminders reflect reviewed truth, and manual reminders remain intact.",
        severityIfBroken: "P0",
        blocksRelease: true
      }
    ]
  },
  {
    checklist: "admin/debug checklist",
    items: [
      {
        title: "failure lists load",
        steps: [
          "Open admin/debug with seeded failures."
        ],
        expectedResult:
          "Failed reminders, notification attempts, extraction failures, and import jobs render cleanly.",
        severityIfBroken: "P1",
        blocksRelease: false
      },
      {
        title: "rescue action affordances",
        steps: [
          "Inspect rerun and resend action buttons.",
          "Trigger one safe seeded action if allowed."
        ],
        expectedResult:
          "Rescue actions are visible, understandable, and executable only in intended contexts.",
        severityIfBroken: "P0",
        blocksRelease: true
      },
      {
        title: "admin strategy console visibility",
        steps: [
          "Scroll through admin panel strategy sections."
        ],
        expectedResult:
          "Admin console remains readable and does not visually break under long content.",
        severityIfBroken: "P2",
        blocksRelease: false
      }
    ]
  },
  {
    checklist: "settings/integrations checklist",
    items: [
      {
        title: "org settings save",
        steps: [
          "Change a non-destructive org setting as admin.",
          "Save and reload."
        ],
        expectedResult:
          "Setting persists and success feedback is shown clearly.",
        severityIfBroken: "P1",
        blocksRelease: false
      },
      {
        title: "digest/billing context visibility",
        steps: [
          "Open settings on trial, paid, or digest-enabled test orgs."
        ],
        expectedResult:
          "Billing/trial and digest context is visible and understandable.",
        severityIfBroken: "P1",
        blocksRelease: false
      },
      {
        title: "member restrictions on settings",
        steps: [
          "Open settings as a non-admin member."
        ],
        expectedResult:
          "Restricted controls are not actionable and backend protection remains in place.",
        severityIfBroken: "P0",
        blocksRelease: true
      }
    ]
  },
  {
    checklist: "UX sanity checklist",
    items: [
      {
        title: "first-value clarity",
        steps: [
          "Use a fresh or near-empty workspace.",
          "Inspect dashboard, onboarding, and create-contract paths."
        ],
        expectedResult:
          "A new user can tell what to do next and how to reach first value.",
        severityIfBroken: "P1",
        blocksRelease: false
      },
      {
        title: "critical warning clarity",
        steps: [
          "Inspect trust, billing, or warning banners on seeded states."
        ],
        expectedResult:
          "Important warnings are visually obvious and actionable.",
        severityIfBroken: "P1",
        blocksRelease: false
      },
      {
        title: "error-state usability",
        steps: [
          "Trigger a safe validation or denied action error.",
          "Inspect resulting error state."
        ],
        expectedResult:
          "Error or denial messaging is safe, clear, and recoverable.",
        severityIfBroken: "P1",
        blocksRelease: false
      }
    ]
  }
];

