export type UiRegressionArea = {
  area: string;
  visuallyRegressionTested: string[];
  interactionTested: string[];
  manuallyQaChecked: string[];
  topUxRegressionsLikelyToHurtTrustOrConversion: string[];
  topUsabilityFailuresLikelyToHurtAdoption: string[];
};

export const uiRegressionTestingAreas: UiRegressionArea[] = [
  {
    area: "dashboard layout and key metrics visibility",
    visuallyRegressionTested: [
      "primary dashboard card layout and responsive stacking",
      "key KPI cards, onboarding checklist, upgrade prompts, and retention health panels",
      "due-soon, review, and failure-state sections above the fold"
    ],
    interactionTested: [
      "dashboard loads with realistic seeded data",
      "onboarding checklist updates after first-value actions",
      "upgrade prompts navigate to the expected billing or settings flows"
    ],
    manuallyQaChecked: [
      "scan dashboard on desktop and mobile-width breakpoints",
      "verify key trust and action signals are visible without hunting",
      "check that empty dashboard does not feel broken or dead"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "critical reminder/review signals disappear below noisy strategy or secondary content",
      "dashboard metrics render stale-looking or contradictory values",
      "upgrade prompts obscure key operational actions"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "user cannot tell what action to take next",
      "important risk counts are visually buried",
      "dashboard looks like reporting only, not an operational workspace"
    ]
  },
  {
    area: "contract table behavior",
    visuallyRegressionTested: [
      "column layout, truncation, and status badge rendering",
      "table density, row hover states, and empty/loading skeletons",
      "action affordances for row-level operations"
    ],
    interactionTested: [
      "sorting, paging, and row navigation",
      "row actions open expected detail or edit flow",
      "table remains usable with long names, missing fields, and mixed statuses"
    ],
    manuallyQaChecked: [
      "review table readability with realistic portfolios",
      "check horizontal overflow and small-screen behavior",
      "verify status badges and due-soon cues are scannable"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "wrong columns disappear or collapse unpredictably",
      "status or due-date cues become unreadable",
      "table actions become hard to discover"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "users cannot quickly find risky contracts",
      "table becomes too dense to scan",
      "navigation from list to detail feels fragile"
    ]
  },
  {
    area: "filter behavior",
    visuallyRegressionTested: [
      "filter bar layout and active-filter chips",
      "empty-state messaging after filter application",
      "selected-state clarity for status and date filters"
    ],
    interactionTested: [
      "single and combined filters narrow results correctly",
      "clear/reset actions restore expected table state",
      "filters persist or reset as designed across navigation"
    ],
    manuallyQaChecked: [
      "test realistic filter combinations for due-soon, review, owner-gap, and status workflows",
      "verify filtered empty states remain informative",
      "verify filters do not silently conflict"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "filter UI shows selected state incorrectly",
      "applied filters produce stale-looking results",
      "users lose context when returning from contract detail"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "users cannot isolate the contracts needing action",
      "filter reset behavior is surprising",
      "filter controls feel unreliable or sticky in the wrong way"
    ]
  },
  {
    area: "create contract page usability",
    visuallyRegressionTested: [
      "upload/manual creation option layout",
      "contract-cap or plan-banner visibility",
      "form spacing, helper text, and submit affordances"
    ],
    interactionTested: [
      "switching between upload and manual creation modes",
      "validation error display and recovery",
      "commercial gate behavior when plan or cap blocks the action"
    ],
    manuallyQaChecked: [
      "complete create-contract flow with real fixture data",
      "verify trust and commercial messaging are understandable",
      "check that the page does not overload new users"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "create page hides why an action is blocked",
      "validation errors appear far from the failing field",
      "upload and manual paths feel inconsistent"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "new users cannot tell whether to upload or enter manually",
      "plan-limit messaging feels like a bug instead of a commercial gate",
      "form completion feels too heavy for first value"
    ]
  },
  {
    area: "auth screens",
    visuallyRegressionTested: [
      "auth page hierarchy, CTA placement, and trust copy",
      "sign-in vs sign-up state clarity",
      "error and loading states"
    ],
    interactionTested: [
      "sign-up and sign-in form validation",
      "auth callback or redirect path",
      "preservation of source/trial context"
    ],
    manuallyQaChecked: [
      "end-to-end signup and sign-in pass",
      "check auth page clarity for first-time visitors",
      "verify redirect behavior from marketing CTAs"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "auth page loses the connection to the pricing/trial promise",
      "callback path feels broken or ambiguous",
      "errors render in a generic or scary way"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "sign-up is confusing or feels risky",
      "users cannot tell whether account creation succeeded",
      "marketing-to-auth handoff loses context"
    ]
  },
  {
    area: "settings screens",
    visuallyRegressionTested: [
      "plan status, trial state, and billing CTA visibility",
      "settings section grouping and hierarchy",
      "save-state, success, and error messaging"
    ],
    interactionTested: [
      "settings save and reload",
      "billing CTA navigation",
      "role-restricted controls hidden and protected"
    ],
    manuallyQaChecked: [
      "check settings with admin and member roles",
      "verify digest and org-level settings are understandable",
      "verify trial/billing context is visible when it matters"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "billing or trial state disappears from settings",
      "save feedback is unclear",
      "restricted controls appear but fail later"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "admins cannot confidently configure the workspace",
      "settings feel risky to change",
      "commercial state is invisible until a feature fails"
    ]
  },
  {
    area: "pricing page",
    visuallyRegressionTested: [
      "plan cards, price anchors, CTA hierarchy, and service/add-on sections",
      "comparison clarity across Starter, Growth, and Portfolio",
      "mobile readability and plan-card stacking"
    ],
    interactionTested: [
      "plan CTA click-through behavior",
      "links to auth, packaging, and services pages",
      "pricing-page-to-upgrade path from signed-in and signed-out states"
    ],
    manuallyQaChecked: [
      "read pricing page as a first-time buyer",
      "validate copy against actual gating behavior",
      "check whether upgrade path feels coherent rather than salesy"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "pricing cards drift from actual plan logic",
      "primary CTA is visually weak or misleading",
      "important contract-band message is obscured"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "buyers cannot tell which plan they need",
      "pricing feels arbitrary because value metric is hidden",
      "upgrade path is visually fragmented"
    ]
  },
  {
    area: "notice banners",
    visuallyRegressionTested: [
      "warning, success, billing, and trust banners",
      "severity differentiation and placement",
      "banner readability on small screens"
    ],
    interactionTested: [
      "dismiss/close behavior if supported",
      "banner CTA links",
      "banner appearance under billing, trial, and operational warning conditions"
    ],
    manuallyQaChecked: [
      "check that critical banners do not blend into generic notice styles",
      "verify banner priority when multiple warnings exist",
      "verify billing and trust banners are not confused with each other"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "critical warning looks like low-priority info",
      "banner CTA is missing or broken",
      "multiple banners create confusing alert fatigue"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "users ignore important state changes",
      "billing issues feel like bugs instead of actionable problems",
      "trust warnings are too subtle"
    ]
  },
  {
    area: "empty states",
    visuallyRegressionTested: [
      "zero-data dashboard, contract list, import history, and admin views",
      "illustration/copy hierarchy and CTA visibility",
      "spacing and visual balance"
    ],
    interactionTested: [
      "empty-state CTA routes to the expected first action",
      "post-empty-state flows return users to filled states correctly"
    ],
    manuallyQaChecked: [
      "review empty states for first-time users and post-filter no-results views",
      "verify empty-state copy is instructional rather than apologetic",
      "verify empty state does not feel like load failure"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "empty state looks like broken data loading",
      "CTA is missing from key first-time states",
      "empty-state copy undersells what to do next"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "new users bounce because the app feels empty and directionless",
      "no-results states give no recovery path",
      "admins cannot tell whether there is no data or a sync failure"
    ]
  },
  {
    area: "error states",
    visuallyRegressionTested: [
      "inline form errors, page-level errors, and commercial denial states",
      "safe-message clarity and severity styling",
      "error-state spacing and action affordances"
    ],
    interactionTested: [
      "recover from validation errors",
      "commercial denial CTA behavior",
      "retry/reload actions where available"
    ],
    manuallyQaChecked: [
      "review error copy for safety and usefulness",
      "verify errors do not leak raw provider/internal details",
      "verify denial states feel intentional rather than broken"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "generic errors replace actionable commercial or validation states",
      "unsafe internal error text leaks to UI",
      "error state offers no path forward"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "users cannot recover after a failed action",
      "commercial denials look like product instability",
      "review/upload/import errors are too vague to fix"
    ]
  },
  {
    area: "contract detail and review screen",
    visuallyRegressionTested: [
      "detail layout, evidence blocks, status/owner visibility, and review form hierarchy",
      "confidence and needs-review cues",
      "sidebar/panel behavior for reminders and workflow context"
    ],
    interactionTested: [
      "open detail from list and return",
      "review extracted fields and save corrections",
      "owner/status updates and navigation between workflow actions"
    ],
    manuallyQaChecked: [
      "review contract detail with low-confidence extracted data",
      "verify evidence and corrected values are easy to compare",
      "check that the screen prioritizes trust-sensitive information"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "confidence/evidence cues disappear or collapse awkwardly",
      "review save affordances become unclear",
      "critical dates and owner info are visually buried"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "reviewers cannot confidently validate extracted fields",
      "detail screen feels overloaded and hard to parse",
      "post-review workflow next steps are unclear"
    ]
  },
  {
    area: "reminder forms",
    visuallyRegressionTested: [
      "recipient fields, date fields, rule/escalation sections, and validation messaging",
      "commercial gating banners for multi-recipient paths",
      "form layout in create/edit states"
    ],
    interactionTested: [
      "create manual reminder",
      "validate invalid or empty recipient inputs",
      "multi-recipient and escalation flows across eligible and ineligible plans"
    ],
    manuallyQaChecked: [
      "exercise reminder creation with realistic recipient variations",
      "verify plan-denial messaging feels commercial, not broken",
      "check form resilience on mobile-width layouts"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "recipient validation errors are confusing or hidden",
      "multi-recipient gate appears too late in the flow",
      "save button state becomes inconsistent"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "users do not trust who will receive a reminder",
      "advanced reminder setup feels brittle",
      "manual reminder flow is too error-prone"
    ]
  },
  {
    area: "admin panels",
    visuallyRegressionTested: [
      "debug cards, failure lists, import history, and strategy sections",
      "failed reminder and notification log readability",
      "high-power action button visibility and separation"
    ],
    interactionTested: [
      "rerun reminder and resend notification actions",
      "scroll and navigation through large admin content sections",
      "role-based route protection and direct URL access behavior"
    ],
    manuallyQaChecked: [
      "review admin screen readability under realistic failure volume",
      "verify rescue actions are discoverable but not reckless",
      "check that non-admins cannot reach admin panels"
    ],
    topUxRegressionsLikelyToHurtTrustOrConversion: [
      "admin failure context becomes unreadable during incidents",
      "rescue actions move or disappear during regressions",
      "admin screen becomes too dense to use operationally"
    ],
    topUsabilityFailuresLikelyToHurtAdoption: [
      "operators cannot diagnose reminder/import failures quickly",
      "high-power actions are too hard to find in production incidents",
      "support team wastes time because debug views are noisy"
    ]
  }
];

export const topUiUxRegressionRisks = [
  "Dashboard hides or buries the next action, making the app feel passive instead of operational.",
  "Pricing, plan, or upgrade states drift visually from real billing logic and hurt conversion.",
  "Contract detail/review screen loses evidence or confidence cues and damages trust in extraction.",
  "Commercial denials or billing states look like broken product errors.",
  "Reminder forms regress in validation clarity, making users unsure who will be notified.",
  "Filter or table regressions make it hard to find risky contracts quickly.",
  "Empty states feel like load failures rather than guided next steps.",
  "Admin incident views become unreadable when failures actually happen."
];

export const topUsabilityAdoptionRisks = [
  "New users cannot tell what first value looks like after signup.",
  "Contract creation paths feel too heavy or ambiguous for first-time use.",
  "Review workflow is visually overloaded, so users do not trust or complete review.",
  "Reminder creation feels brittle, so users avoid operationalizing the product.",
  "Settings and billing state are too hidden, so admins discover problems too late.",
  "Table/filter interactions are unreliable, so teams fall back to spreadsheets.",
  "Trust-sensitive warnings are too subtle, so users miss urgent operational issues.",
  "Error and denial states give no clear recovery path."
];

