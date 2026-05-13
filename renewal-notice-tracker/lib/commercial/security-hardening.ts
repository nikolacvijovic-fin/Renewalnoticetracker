export type SecurityMaturityScore = {
  area:
    | "auth_security"
    | "authorization_quality"
    | "tenant_isolation"
    | "admin_internal_tooling_safety"
    | "billing_security"
    | "reminder_reliability_safety"
    | "webhook_cron_safety"
    | "auditability"
    | "privacy_posture"
    | "compliance_readiness"
    | "overall_security_maturity";
  label: string;
  score: number;
  rationale: string;
};

export type SecurityRiskArea = {
  title: string;
  strong: string[];
  weak: string[];
  missing: string[];
  dangerous: string[];
  fixFirst: string[];
};

export type HardeningRecommendation = {
  title: string;
  whyItMatters: string;
  riskIfIgnored: string;
  implementationEffort: "low" | "medium" | "high";
  severity: "medium" | "high" | "critical";
  blocksRelease: boolean;
};

export type SecurityPolicySection = {
  title: string;
  summary: string;
  rules: string[];
};

export const securityCurrentStateReview = {
  authModel: [
    "Supabase auth is the base identity layer, with server-side helpers like requireUser and requireOrganization protecting app access.",
    "Current organization context is derived from memberships, but the app currently appears to default to a single membership lookup instead of an explicit active-org selection model."
  ],
  roleModel: [
    "The effective role model is membership-based with owner, admin, and member boundaries enforced in app-layer helpers like requireOrgRole.",
    "Owner/admin boundaries already gate sensitive routes such as billing, settings mutations, and admin/debug actions."
  ],
  tenantModel: [
    "The product is multi-tenant at the organization level with organization_id carried across contracts, reminders, exports, import jobs, evidence rows, and audit logs.",
    "Supabase RLS is enabled broadly across core domain tables, which is a strong baseline for tenant safety."
  ],
  routeLevelProtections: [
    "Billing routes, admin routes, and sensitive settings flows already require authenticated org context and role checks.",
    "Webhook endpoints validate provider signatures, and the reminder cron route uses a shared secret."
  ],
  objectLevelAccess: [
    "Object-level scoping exists in many query helpers through organization_id filters, especially for contract reads and exports.",
    "Object-level protection becomes less trustworthy when server actions switch to the service-role admin client and then fetch by raw id without org scoping."
  ],
  adminInternalRoutes: [
    "There is an internal health route with dual access modes: secret-based and owner/admin-based.",
    "There are owner/admin-triggered rescue actions for rerunning reminders and resending notifications."
  ],
  commercialBillingProtections: [
    "Owner/admin-only billing route access is already present.",
    "Entitlements exist for exports, manual contracts, digests, and multi-recipient reminders, and webhook providers validate signatures."
  ],
  auditability: [
    "Major actions already write audit logs, including billing, settings updates, trial creation, and admin rescue flows.",
    "Audit coverage exists, but immutability and anti-tamper guarantees are not obvious from the current application layer."
  ],
  compliancePrivacyControls: [
    "The product stores organization-scoped data with a narrow operational wedge, which is good for data minimization if enforced.",
    "There is no visible end-to-end deletion, retention, DSAR, or secret-rotation operating model encoded yet."
  ],
  assumptions: [
    "The service-role admin client is used heavily in trusted server paths, so app-layer authorization correctness is a release-critical security dependency.",
    "The current admin and reliability tooling is intended for internal or privileged organizational operators, not general members.",
    "There is no mature external compliance program encoded yet beyond practical SMB and lower mid-market expectations."
  ]
};

export const securityMaturityScores: SecurityMaturityScore[] = [
  {
    area: "auth_security",
    label: "Auth security",
    score: 7,
    rationale: "Supabase auth, protected server helpers, and role-gated routes are a solid base, but active-org context remains weaker than it should be."
  },
  {
    area: "authorization_quality",
    label: "Authorization quality",
    score: 5,
    rationale: "Role gates exist, but service-role bypass paths and raw-id rescue flows make object-level authorization quality too dependent on app discipline."
  },
  {
    area: "tenant_isolation",
    label: "Tenant isolation",
    score: 6,
    rationale: "Broad RLS coverage is a real strength, but tenant safety is weakened wherever service-role code bypasses it."
  },
  {
    area: "admin_internal_tooling_safety",
    label: "Admin/internal tooling safety",
    score: 4,
    rationale: "Admin and internal routes exist, but they are powerful enough that weaker scoping, weak logging, or secret leakage would be dangerous."
  },
  {
    area: "billing_security",
    label: "Billing security",
    score: 7,
    rationale: "Owner/admin-only billing access and signed webhook verification are strong, but idempotency, replay handling, and edge-state drift still need tightening."
  },
  {
    area: "reminder_reliability_safety",
    label: "Reminder/reliability safety",
    score: 5,
    rationale: "Reminder flows are heavily instrumented, but admin rescue by id and cron trust surfaces still need stricter hardening."
  },
  {
    area: "webhook_cron_safety",
    label: "Webhook/cron safety",
    score: 6,
    rationale: "Secrets and signature verification exist, but replay resistance, rate limiting, and error-message hygiene are still too soft."
  },
  {
    area: "auditability",
    label: "Auditability",
    score: 6,
    rationale: "Audit coverage is meaningful today, but append-only guarantees, access controls, and integrity expectations need clearer policy."
  },
  {
    area: "privacy_posture",
    label: "Privacy posture",
    score: 4,
    rationale: "The wedge is narrow, but retention, deletion, data minimization, and secret treatment are not yet encoded strongly enough."
  },
  {
    area: "compliance_readiness",
    label: "Compliance readiness",
    score: 4,
    rationale: "The product is credible for pragmatic SMB security review, but not yet organized enough for serious buyer questionnaires."
  },
  {
    area: "overall_security_maturity",
    label: "Overall security maturity",
    score: 5,
    rationale: "Better than a greenfield startup because real controls exist, but still not hardened enough for trust-sensitive contract operations."
  }
];

export const securityRiskMap: SecurityRiskArea[] = [
  {
    title: "Authentication",
    strong: [
      "Supabase auth gives a real identity system instead of ad hoc sessions.",
      "Server-side route helpers already force auth on protected app paths."
    ],
    weak: [
      "The product appears to infer a single current membership rather than using an explicit active organization context."
    ],
    missing: [
      "Session anomaly detection, device/session management visibility, and stronger auth-event auditing."
    ],
    dangerous: [
      "A wrong-org context bug can become a tenant-isolation bug, not just a UX issue."
    ],
    fixFirst: [
      "Move to explicit active-org selection and validation on every privileged path."
    ]
  },
  {
    title: "Session handling",
    strong: [
      "The app depends on Supabase-managed session handling rather than custom JWT parsing in every route."
    ],
    weak: [
      "Internal and rescue routes rely more on top-level guard assumptions than on explicit per-object session-to-org validation."
    ],
    missing: [
      "Consistent session expiry handling, privileged-action revalidation, and suspicious-session monitoring."
    ],
    dangerous: [
      "A stale or mis-bound session can operate against the wrong organization if context selection stays implicit."
    ],
    fixFirst: [
      "Require organization-bound session context for all owner/admin actions."
    ]
  },
  {
    title: "Authorization",
    strong: [
      "Role-gated helpers and owner/admin-only routes already exist."
    ],
    weak: [
      "Authorization quality drops wherever service-role code performs writes or rescue actions after only coarse route-level checks."
    ],
    missing: [
      "A centralized permission matrix and reusable object-level authorization guard layer."
    ],
    dangerous: [
      "Route-level protection without action-level scoping creates fake safety."
    ],
    fixFirst: [
      "Add object-scoped authorization checks before every service-role read, write, resend, rerun, export, or admin mutation."
    ]
  },
  {
    title: "Tenant isolation",
    strong: [
      "RLS is enabled on a broad set of tenant-bearing tables."
    ],
    weak: [
      "The service-role client bypasses RLS and therefore weakens tenant isolation wherever manual scoping is incomplete."
    ],
    missing: [
      "A formal policy that privileged code must always fetch by organization_id plus object id, not object id alone."
    ],
    dangerous: [
      "Any forgotten organization filter becomes a cross-tenant leak."
    ],
    fixFirst: [
      "Audit all service-role code paths and remove raw-id fetches for tenant-bound objects."
    ]
  },
  {
    title: "Object-level access control",
    strong: [
      "Many query helpers already bind reads to organization_id."
    ],
    weak: [
      "High-power helper paths like resend and rerun appear vulnerable to object lookup by raw id."
    ],
    missing: [
      "Uniform object ownership verification for contracts, reminders, notification logs, exports, import jobs, and audit reads."
    ],
    dangerous: [
      "An owner/admin in Org A being able to act on Org B objects via guessed ids is a release-blocking defect."
    ],
    fixFirst: [
      "Enforce organization ownership checks inside helper functions, not only at route entry."
    ]
  },
  {
    title: "Admin/debug/internal routes",
    strong: [
      "Admin screens are already limited to owner/admin roles."
    ],
    weak: [
      "The health route has dual access modes and returns meaningful internal state.",
      "Rescue actions are operationally powerful."
    ],
    missing: [
      "Strict least-privilege separation between customer-admin tooling and internal-operator tooling."
    ],
    dangerous: [
      "Internal visibility and rescue flows become data-exposure or abuse paths if they are not tightly scoped and fully audited."
    ],
    fixFirst: [
      "Split customer-admin tooling from internal-ops routes and add stronger audit coverage plus rate limits."
    ]
  },
  {
    title: "Billing and entitlements",
    strong: [
      "Billing route access is owner/admin-only and provider signatures are already validated."
    ],
    weak: [
      "Webhook synchronization appears stateful but not visibly idempotent enough.",
      "Commercial state drift can still happen across active, past_due, inactive, and cancelled transitions."
    ],
    missing: [
      "Replay protection, event-order handling policy, and alerting for mismatched subscription state."
    ],
    dangerous: [
      "Incorrect entitlement state is both a revenue bug and a trust bug."
    ],
    fixFirst: [
      "Add idempotent webhook processing with event ledgering and state-transition validation."
    ]
  },
  {
    title: "Webhook security",
    strong: [
      "Stripe, Paddle, and PayPal webhook verification already exists."
    ],
    weak: [
      "Webhook handlers still risk raw error leakage and incomplete replay handling."
    ],
    missing: [
      "Consistent event replay detection, signature-failure alerting, and payload logging rules."
    ],
    dangerous: [
      "A forged or replayed webhook can corrupt billing state or hide entitlement drift."
    ],
    fixFirst: [
      "Persist verified provider event ids and reject duplicates or impossible transitions."
    ]
  },
  {
    title: "Cron security",
    strong: [
      "Reminder cron requires a shared secret."
    ],
    weak: [
      "Shared-secret-only protection is enough for early stage, but brittle without rotation and source restriction discipline."
    ],
    missing: [
      "Secret rotation policy, rate limiting, and stronger origin or job-token controls."
    ],
    dangerous: [
      "Cron endpoints can be abused for spam, load, or operational disruption if the secret leaks."
    ],
    fixFirst: [
      "Add secret rotation guidance, strict audit logging, and safer error responses."
    ]
  },
  {
    title: "File/document handling",
    strong: [
      "Storage paths are organization-scoped and unsupported file types are rejected."
    ],
    weak: [
      "There is no visible malware scanning, document quarantine, or content-disposition hardening policy."
    ],
    missing: [
      "File size limits, scan/quarantine posture, and storage-retention/deletion playbook."
    ],
    dangerous: [
      "Document workflows become a privacy and abuse surface fast if uploads are treated as benign."
    ],
    fixFirst: [
      "Set strict file constraints and add malware/quarantine posture before wider customer use."
    ]
  },
  {
    title: "Extraction/review trust",
    strong: [
      "Fallback behavior marks failed extraction as needs_review and preserves reviewer_notes."
    ],
    weak: [
      "False-confidence risk remains if low-confidence outputs are treated operationally before clear review completion."
    ],
    missing: [
      "Immutable provenance rules for extracted evidence and explicit reviewed-vs-generated distinction everywhere users act on data."
    ],
    dangerous: [
      "Wrong or ambiguous dates turning into live reminders without obvious trust cues would destroy customer trust."
    ],
    fixFirst: [
      "Make reviewed truth clearly distinct from extracted suggestion and log provenance changes."
    ]
  },
  {
    title: "Audit log integrity",
    strong: [
      "The application already records many high-value actions."
    ],
    weak: [
      "Audit writes are centralized but not obviously protected as append-only or tamper-evident."
    ],
    missing: [
      "Integrity policy, privileged read policy, and retention policy."
    ],
    dangerous: [
      "If security-sensitive actions are editable or sparsely logged, incident response becomes guesswork."
    ],
    fixFirst: [
      "Make audit records append-only and expand coverage on auth, permission denial, admin rescue, and secret-sensitive changes."
    ]
  },
  {
    title: "Privacy, deletion, and compliance",
    strong: [
      "The product scope is operational and narrower than full CLM, which helps data minimization."
    ],
    weak: [
      "Webhook URLs, extracted text, source snippets, and uploaded documents create meaningful privacy exposure."
    ],
    missing: [
      "Retention schedules, deletion workflows, export-rights workflow, and buyer-facing security documentation."
    ],
    dangerous: [
      "A product that stores contract text and evidence without clear deletion and retention controls will fail real security review."
    ],
    fixFirst: [
      "Define data categories, retention windows, deletion procedures, and buyer-facing privacy/security docs."
    ]
  },
  {
    title: "Secrets, abuse, and operational risk",
    strong: [
      "Secrets are centralized in env validation instead of ad hoc inline strings."
    ],
    weak: [
      "No visible rate limits, anomaly alerts, or abuse controls for high-cost or high-trust endpoints."
    ],
    missing: [
      "Secret rotation runbook, rate limiting, operational alerting, and on-call incident classification."
    ],
    dangerous: [
      "Leaked secrets or automated abuse can create billing, spam, or extraction-cost incidents quickly."
    ],
    fixFirst: [
      "Add rate limits, anomaly alerts, and rotation procedures for cron, webhooks, billing, upload, and admin endpoints."
    ]
  }
];

export const securityHardeningPlan: Record<string, HardeningRecommendation[]> = {
  criticalFixesNow: [
    {
      title: "Eliminate raw-id privileged actions for tenant-bound objects",
      whyItMatters: "Any service-role helper that fetches reminders, logs, exports, or jobs by id alone can bypass RLS and become a cross-tenant action path.",
      riskIfIgnored: "A single missed scope check can let one org act on another org's data or operational jobs.",
      implementationEffort: "medium",
      severity: "critical",
      blocksRelease: true
    },
    {
      title: "Introduce explicit active-organization context",
      whyItMatters: "Implicit first-membership lookup is too weak for a multi-org B2B product.",
      riskIfIgnored: "Wrong-org actions, wrong data exposure, and weak tenant guarantees.",
      implementationEffort: "medium",
      severity: "critical",
      blocksRelease: true
    },
    {
      title: "Sanitize webhook and cron error responses",
      whyItMatters: "Operational endpoints should not leak internal exception detail.",
      riskIfIgnored: "Attackers and curious users get reconnaissance-grade failure information.",
      implementationEffort: "low",
      severity: "high",
      blocksRelease: true
    }
  ],
  authHardening: [
    {
      title: "Add privileged-action revalidation for owner/admin operations",
      whyItMatters: "High-power actions should verify current org and role at execution time, not only via page access.",
      riskIfIgnored: "Session/context drift weakens privileged boundaries.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    },
    {
      title: "Audit auth events and suspicious sign-in behavior",
      whyItMatters: "Security incidents are easier to investigate with auth visibility.",
      riskIfIgnored: "Account misuse is harder to detect and explain.",
      implementationEffort: "medium",
      severity: "medium",
      blocksRelease: false
    }
  ],
  authorizationHardening: [
    {
      title: "Create a centralized permission matrix",
      whyItMatters: "Scattered role checks drift over time and produce hidden privilege inconsistencies.",
      riskIfIgnored: "Permission behavior becomes unpredictable and under-tested.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    },
    {
      title: "Enforce action-level authorization everywhere service-role code runs",
      whyItMatters: "Route-level visibility is not the same as safe mutation authority.",
      riskIfIgnored: "Hidden privilege escalation via server actions.",
      implementationEffort: "high",
      severity: "critical",
      blocksRelease: true
    }
  ],
  tenantIsolationHardening: [
    {
      title: "Audit and remove service-role queries that do not bind organization_id",
      whyItMatters: "RLS does nothing when bypassed by service-role clients.",
      riskIfIgnored: "Cross-tenant leakage risk remains latent in trusted code.",
      implementationEffort: "high",
      severity: "critical",
      blocksRelease: true
    },
    {
      title: "Add negative authorization tests for every tenant-bound privileged path",
      whyItMatters: "Tenant isolation should be proved, not assumed.",
      riskIfIgnored: "Regressions ship silently.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: true
    }
  ],
  adminInternalToolingHardening: [
    {
      title: "Separate customer-admin tooling from internal-operator tooling",
      whyItMatters: "Org admins should not automatically get access to internal diagnostics depth.",
      riskIfIgnored: "Debug convenience expands data exposure and abuse surface.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    },
    {
      title: "Audit every rescue action with actor, object, org, and reason",
      whyItMatters: "High-power reruns and resends need traceability.",
      riskIfIgnored: "Operational misuse and incident reconstruction become difficult.",
      implementationEffort: "low",
      severity: "high",
      blocksRelease: false
    }
  ],
  billingCommercialHardening: [
    {
      title: "Make webhook handling idempotent and state-transition aware",
      whyItMatters: "Billing state is safety-critical for trust and revenue.",
      riskIfIgnored: "Duplicate or out-of-order events cause entitlement drift.",
      implementationEffort: "medium",
      severity: "critical",
      blocksRelease: true
    },
    {
      title: "Log and alert on impossible billing state transitions",
      whyItMatters: "Commercial bugs are easier to catch early when they are explicit anomalies.",
      riskIfIgnored: "Customers get silently over-blocked or under-blocked.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    }
  ],
  webhookCronHardening: [
    {
      title: "Add replay protection and provider event ledgering",
      whyItMatters: "Signature verification is not enough if duplicates are accepted blindly.",
      riskIfIgnored: "Repeated or replayed events mutate state more than once.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: true
    },
    {
      title: "Add rotation, rate-limit, and alerting rules for cron and internal secrets",
      whyItMatters: "Shared-secret endpoints degrade quickly if not treated as high-value credentials.",
      riskIfIgnored: "Leakage turns into abuse or silent background job manipulation.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    }
  ],
  fileDocumentDataHardening: [
    {
      title: "Add file size, type, and malware/quarantine controls",
      whyItMatters: "Contract uploads are a direct trust and abuse surface.",
      riskIfIgnored: "Malicious or oversized documents create security, privacy, and operational risk.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    },
    {
      title: "Separate extracted suggestion from reviewed truth everywhere",
      whyItMatters: "Users must never confuse generated metadata with validated metadata.",
      riskIfIgnored: "False confidence becomes a product-trust incident.",
      implementationEffort: "medium",
      severity: "critical",
      blocksRelease: true
    }
  ],
  auditIntegrityHardening: [
    {
      title: "Make audit logs append-only and security-visible",
      whyItMatters: "Audit trails matter most when something goes wrong.",
      riskIfIgnored: "Tampered or incomplete logs weaken incident response and buyer trust.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    },
    {
      title: "Expand audit coverage on permission denials and secret-sensitive config changes",
      whyItMatters: "Denied actions and config mutations are often security signals.",
      riskIfIgnored: "Abuse attempts and risky config drift remain invisible.",
      implementationEffort: "low",
      severity: "medium",
      blocksRelease: false
    }
  ],
  privacyComplianceHardening: [
    {
      title: "Define data retention and deletion workflows",
      whyItMatters: "Contract files, extracted text, evidence rows, and audit logs all need lifecycle rules.",
      riskIfIgnored: "The product will fail practical privacy and security review.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    },
    {
      title: "Reduce unnecessary user-table and org-secret exposure",
      whyItMatters: "Privacy posture improves when the app loads only what it needs.",
      riskIfIgnored: "Minimization claims look weak and accidental overexposure risk rises.",
      implementationEffort: "medium",
      severity: "medium",
      blocksRelease: false
    }
  ],
  monitoringAlertingHardening: [
    {
      title: "Alert on cross-tenant-denial failures, webhook anomalies, reminder rescue spikes, and internal-route access",
      whyItMatters: "Security incidents often appear first as weird operational patterns.",
      riskIfIgnored: "Real abuse or drift can hide inside normal ops noise.",
      implementationEffort: "medium",
      severity: "high",
      blocksRelease: false
    }
  ],
  cutOrSimplify: [
    {
      title: "Cut or defer internal routes and admin depth that are not essential to the renewal-ops wedge",
      whyItMatters: "Every high-power internal feature increases the blast radius.",
      riskIfIgnored: "Security complexity grows faster than real customer value.",
      implementationEffort: "low",
      severity: "medium",
      blocksRelease: false
    },
    {
      title: "Avoid pseudo-enterprise permission complexity before the core model is airtight",
      whyItMatters: "Complicated permission matrices are dangerous when fundamentals are still tightening.",
      riskIfIgnored: "You add complexity without raising buyer trust materially.",
      implementationEffort: "low",
      severity: "medium",
      blocksRelease: false
    }
  ]
};

export const securityPolicyAndControlDesign: SecurityPolicySection[] = [
  {
    title: "Role model",
    summary: "Keep the role model small and explicit.",
    rules: [
      "owner: billing, organization settings, integrations, member management, privileged exports, and customer-admin rescue flows.",
      "admin: operational administration inside the org, but no billing ownership transfer or destructive org lifecycle actions by default.",
      "member: contract workflow actions within org boundaries, but no billing, org-wide secret management, or privileged rescue operations."
    ]
  },
  {
    title: "Permission model",
    summary: "Permissions should be action-based, not page-based.",
    rules: [
      "Every privileged action must validate user identity, active organization, membership, role, and object ownership.",
      "UI hiding is never a permission control; all server actions and routes must be safe when called directly.",
      "Service-role code must call shared authorization helpers before any tenant-bound mutation or rescue path."
    ]
  },
  {
    title: "Object access rules",
    summary: "All tenant-bound objects must be scoped by organization_id plus object id.",
    rules: [
      "Contracts, reminders, notification logs, exports, import jobs, evidence rows, notes, playbook runs, and audit reads must always validate organization ownership.",
      "No helper may fetch tenant-bound objects by raw id alone when using service-role credentials.",
      "Cross-object actions like resend notification or rerun reminder must verify both the object and all linked parent objects belong to the active organization."
    ]
  },
  {
    title: "Org-boundary rules",
    summary: "Organization boundaries are the main security boundary of the product.",
    rules: [
      "Active-org context must be explicit and persisted per session or request context.",
      "Organization switching should require a deliberate user action, not implicit first-membership resolution.",
      "Every audit, billing, export, and admin action must record the organization_id explicitly."
    ]
  },
  {
    title: "Audit log rules",
    summary: "Audit logs should support real incident response, not cosmetic history.",
    rules: [
      "Audit rows should be append-only and non-user-editable.",
      "Record actor_user_id, organization_id, object ids, action, result, and security-relevant details without storing secrets.",
      "Log permission denials, internal route access, billing changes, rescue actions, membership changes, and secret-sensitive setting changes."
    ]
  },
  {
    title: "Internal route rules",
    summary: "Internal routes should be few, narrow, and fully auditable.",
    rules: [
      "Split customer-visible admin functionality from internal operator functionality wherever possible.",
      "Require strong shared secrets or internal auth, rate limits, and audit logs for internal endpoints.",
      "Never return raw stack traces or provider exception messages from internal, webhook, or cron endpoints."
    ]
  },
  {
    title: "Webhook validation rules",
    summary: "Webhook acceptance requires authenticity, freshness, and sane state transitions.",
    rules: [
      "Verify provider signature first, then validate event freshness and replay status, then process with idempotency.",
      "Persist canonical provider event ids and processing outcomes.",
      "Reject impossible or regressive billing transitions unless explicitly supported."
    ]
  },
  {
    title: "Cron authentication rules",
    summary: "Cron routes should behave like privileged machine APIs.",
    rules: [
      "Use rotated secrets, narrow route scope, and audit each execution with source, result, and counts.",
      "Reject unauthorized requests with generic errors only.",
      "Guard rerun and rescue operations separately from normal scheduled execution."
    ]
  },
  {
    title: "Secrets handling rules",
    summary: "Secrets should be minimal, rotated, and never logged.",
    rules: [
      "Store provider credentials, webhook URLs, and internal secrets outside user-visible surfaces and never emit them in logs or errors.",
      "Create a rotation runbook for billing, cron, internal health, messaging, and AI provider secrets.",
      "Treat org-level webhook URLs as sensitive config and redact them from audit and debug views."
    ]
  },
  {
    title: "Privacy and retention rules",
    summary: "Keep only what supports the wedge and document how long it lives.",
    rules: [
      "Define retention windows for uploaded files, extracted text, evidence snippets, logs, and deleted-account remnants.",
      "Support organization-scoped export and deletion workflows that are operationally credible, even if initially manual.",
      "Minimize broad user-table reads and avoid pulling unrelated user records into application memory."
    ]
  }
];

export const securityComplianceReadiness = {
  smbBuyerExpectations: [
    "Clear statement of tenant isolation model, auth model, backup and recovery basics, and incident response contact.",
    "Documented role model, webhook verification, audit logging, and reminder reliability safeguards."
  ],
  lowerMidMarketExpectations: [
    "Buyer-ready security overview, subprocessor list, data retention/deletion posture, change-management basics, and evidence of privileged-route controls.",
    "Demonstrable controls around billing, internal routes, auditability, and tenant-scoped exports."
  ],
  gdprStylePrivacyBasics: [
    "Data inventory by category: contract files, extracted text, metadata, evidence snippets, audit logs, billing contacts, messaging endpoints.",
    "Lawful-basis and processor/controller posture language kept simple and accurate.",
    "Manual but documented DSAR, deletion, and retention processes are better than fake automation."
  ],
  auditTrailExpectations: [
    "Security-sensitive actions should be attributable, timestamped, and organization-scoped.",
    "Audit review should cover settings, billing, rescue actions, membership changes, and permission denials."
  ],
  vendorQuestionnaireReadiness: [
    "Prepare concise answers for auth, encryption, backups, tenant isolation, logging, secrets, subprocessor use, and deletion handling.",
    "Do not claim enterprise certifications or controls that are not actually operational."
  ],
  securityDocumentationReadiness: [
    "Create a short security overview, privacy summary, incident response basics, and data retention statement.",
    "Keep docs narrow, truthful, and aligned to the renewal-ops wedge rather than pretending to be enterprise CLM."
  ]
};

export const securityFinalRecommendation = {
  topRisks: [
    "Service-role paths that bypass RLS without explicit object-level org checks.",
    "Implicit current-org selection via first membership.",
    "Admin rescue actions operating on raw ids.",
    "Internal health and debug routes exposing too much through dual access modes.",
    "Billing webhook replay or state drift.",
    "Raw exception leakage from webhook and cron endpoints.",
    "Lack of formal deletion and retention controls for contract files and extracted evidence.",
    "Weak minimization around broad user reads and secret-bearing org config.",
    "Audit logs that are useful but not yet clearly append-only or integrity-protected.",
    "No rate limiting or anomaly alerting on high-trust endpoints."
  ],
  topFixes: [
    "Add explicit active-organization context.",
    "Bind every service-role tenant object lookup to organization_id.",
    "Harden resend/rerun helpers with object ownership verification.",
    "Implement webhook idempotency and replay protection.",
    "Sanitize webhook/cron/internal errors.",
    "Separate customer-admin from internal-ops tooling.",
    "Create a centralized permission matrix and shared authorization helpers.",
    "Define retention, deletion, and DSAR workflows.",
    "Add rate limiting and anomaly alerts to privileged endpoints.",
    "Make audit logs append-only and expand denial/config coverage."
  ],
  releaseBlockers: [
    "Any cross-tenant access path in contracts, reminders, exports, imports, billing, settings, or admin rescue flows.",
    "Any owner/admin action that works on another organization's object by guessed or copied id.",
    "Webhook handling that cannot prove idempotent state transitions.",
    "Cron or internal routes that leak secrets or detailed internal errors.",
    "Extraction outputs being treated as reviewed truth without explicit review distinction.",
    "Org-level secrets or webhook URLs exposed in logs, debug views, or client payloads.",
    "Missing authorization on billing portal, checkout, settings, or export routes.",
    "No auditable trace for privileged rescue or settings mutations.",
    "Broken deletion/export-rights handling for customer-requested org offboarding.",
    "Inability to explain and prove tenant isolation to a real buyer."
  ],
  bestPermissionModel:
    "Use a small role model backed by action-level authorization and strict organization-scoped object ownership checks on every privileged path. Route-level guards are necessary but never sufficient.",
  bestHardeningRoadmap:
    "First fix tenant-bound service-role paths, active-org context, webhook idempotency, and error leakage. Next tighten internal/admin separation, privacy/deletion posture, and monitoring. Only after that add more surface area or permission complexity.",
  biggestStrategicWarning:
    "The product already has real controls, but the biggest hidden risk is believing RLS and route guards make it safer than it really is. In this codebase, service-role convenience can silently erase your strongest security story if object-level checks are not ruthless."
};
