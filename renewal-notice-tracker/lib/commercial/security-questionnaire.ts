export type SecurityQuestionnaireSection = {
  title: string;
  summary: string;
  items: string[];
};

export const smbBuyerQuestions: SecurityQuestionnaireSection = {
  title: "Likely SMB buyer questions",
  summary:
    "SMB buyers usually want pragmatic trust answers: can the right people log in, can the wrong people see data, can reminders be trusted, and can they leave cleanly if needed.",
  items: [
    "How do users sign in, and how are sessions protected?",
    "Can different team members have different access levels?",
    "How do you make sure one customer cannot see another customer's contracts?",
    "Do you keep an audit trail of important actions like reviews, reminders, exports, and billing changes?",
    "How do you protect uploaded contracts and extracted data?",
    "Can we export our data and request deletion if we stop using the product?",
    "Which subprocessors or vendors help run the product?",
    "What happens if reminder sending or billing synchronization fails?"
  ]
};

export const midMarketBuyerQuestions: SecurityQuestionnaireSection = {
  title: "Likely mid-market buyer questions",
  summary:
    "Mid-market buyers ask more operational and control-oriented questions, especially around tenant isolation, privileged access, incident visibility, backups, and documented policy maturity.",
  items: [
    "Describe your role model and how permissions are enforced server-side.",
    "Do you use row-level security or equivalent tenant-isolation controls?",
    "How are admin/debug tools restricted and audited?",
    "How are billing webhooks, cron routes, and internal health endpoints authenticated and monitored?",
    "What is your backup and recovery posture for contract and audit data?",
    "What are your retention and deletion policies for contracts, extracted text, reminders, notes, and audit logs?",
    "How do you detect and respond to unauthorized access attempts or cross-tenant anomalies?",
    "What documentation can you share: privacy policy, DPA, subprocessor list, security overview, or incident-response expectations?"
  ]
};

export const credibleAnswersNow: SecurityQuestionnaireSection[] = [
  {
    title: "Auth",
    summary:
      "Answer with the current passwordless model, safe redirect handling, session protection, and abuse logging posture without pretending to support controls that are not implemented.",
    items: [
      "We use email-link authentication with protected dashboard flows and server-side session enforcement.",
      "Auth callback redirects are restricted to safe local paths rather than arbitrary external destinations.",
      "Sensitive auth events should be logged and reviewed, especially repeated failures, replay-like callback behavior, and suspicious sign-in bursts.",
      "Do not claim advanced enterprise auth controls unless they are actually available."
    ]
  },
  {
    title: "Roles and permissions",
    summary:
      "Keep the role story small and credible: owner, admin, and member, with backend authorization on privileged org actions.",
    items: [
      "Org roles separate high-power admin actions from normal member usage.",
      "Sensitive actions like billing, settings, exports, reruns, and admin/debug access must be enforced server-side, not only hidden in UI.",
      "The credible answer is simple permission boundaries plus audit coverage, not elaborate RBAC theater."
    ]
  },
  {
    title: "Tenant isolation",
    summary:
      "Tenant isolation is one of the strongest trust questions, so the answer should stay concrete and technical.",
    items: [
      "Organization boundaries are enforced through org-scoped queries and tenant-aware backend controls.",
      "Cross-org lookups, exports, billing actions, and admin views should be denied and auditable.",
      "The safe answer is that tenant isolation is treated as a release-blocking security property."
    ]
  },
  {
    title: "Backup and recovery",
    summary:
      "Buyers need practical continuity assurances, not enterprise theater.",
    items: [
      "State that production data should be backed up on a defined cadence with tested recovery procedures for core records.",
      "Be explicit that recovery planning covers contracts, reminders, settings, and audit-relevant operational data.",
      "If restore drills are not yet routine, say the process is maturing rather than claiming full disaster-recovery sophistication."
    ]
  },
  {
    title: "Data deletion and export",
    summary:
      "Deletion and exit rights need a practical, customer-understandable answer.",
    items: [
      "Customers should be able to export operational data and request deletion under a documented process.",
      "Some audit records may need bounded retention for integrity and abuse investigation rather than instant hard deletion.",
      "Answer with category-based retention and deletion rules rather than vague promises of immediate deletion everywhere."
    ]
  },
  {
    title: "Audit logs",
    summary:
      "The credible answer is append-only, org-scoped, privacy-safe auditability of trust-sensitive actions.",
    items: [
      "Contract changes, review actions, reminder reruns/resends, exports, imports, billing changes, denials, and admin actions should be auditable.",
      "Audit logs should preserve who did what, when, against which org/object, with traceability but without duplicating sensitive contract content.",
      "Only the right privileged users should see audit views."
    ]
  },
  {
    title: "Billing and webhook safety",
    summary:
      "Buyers care less about the billing provider brand and more about whether subscription state is safe and unauthorized billing changes are prevented.",
    items: [
      "Checkout and portal routes should be role-restricted privileged actions.",
      "Webhook handlers should validate signatures, behave idempotently, and avoid wrong-org state changes.",
      "Subscription-state changes should be auditable and entitlement enforcement should fail closed."
    ]
  },
  {
    title: "Vendor and subprocessor posture",
    summary:
      "Keep the answer operationally honest: who processes auth, billing, storage, email, and extraction-related data, and where documentation exists.",
    items: [
      "Maintain a clear subprocessor list covering auth, billing, storage, notification, and any extraction-related providers.",
      "Have a lightweight DPA and privacy/security FAQ ready for buyer review.",
      "Do not imply a full enterprise vendor-risk program if one does not exist yet."
    ]
  },
  {
    title: "Reminder reliability controls",
    summary:
      "This is a product-specific trust question and should be answered as an operational control system, not just an email-sending feature.",
    items: [
      "Reminder processing should include retry behavior, duplicate suppression, failure visibility, and traceable logs.",
      "Digest and reminder rescue flows should be role-protected and auditable.",
      "The strongest answer ties reliability controls to monitoring and release-blocking QA."
    ]
  }
];

export const answerWeakeningGaps: SecurityQuestionnaireSection = {
  title: "Gaps that weaken answers",
  summary:
    "These are the places where answers become softer, more qualified, or obviously weaker in a buyer review.",
  items: [
    "No tested backup and restore story for core customer data.",
    "No documented deletion/export workflow by data category.",
    "Admin or debug tools that are not clearly separated from customer-facing access.",
    "Service-role or privileged backend paths that are not obviously org-scoped.",
    "Weak or missing audit coverage for reminder rescues, exports, billing changes, and denials.",
    "No clear subprocessor inventory or lightweight DPA/security FAQ.",
    "No visible monitoring for webhook failures, cron anomalies, or unauthorized access attempts.",
    "Claims about security maturity that exceed what the product and ops process can prove."
  ]
};

export const requiredTrustDocumentation: SecurityQuestionnaireSection = {
  title: "Documentation that should exist",
  summary:
    "Buyers do not need a giant compliance binder. They do need a small set of clear, current, consistent trust documents.",
  items: [
    "Security overview describing auth, permissions, tenant isolation, auditability, and reminder reliability controls.",
    "Privacy policy aligned to the actual data categories and retention posture.",
    "DPA suitable for SMB and lower mid-market buyers.",
    "Subprocessor list covering auth, billing, storage, notifications, and extraction-related vendors.",
    "Data retention and deletion policy by category.",
    "Backup and recovery summary with realistic recovery commitments.",
    "Security FAQ for questionnaires and sales diligence.",
    "Internal incident-handling and privileged-access policy, even if lightweight."
  ]
};

export const claimsToAvoid: SecurityQuestionnaireSection = {
  title: "Claims to avoid",
  summary:
    "Avoid overclaiming. Weak honesty is better than strong fiction.",
  items: [
    "Do not claim enterprise-grade compliance certifications that are not in place.",
    "Do not claim zero access to customer data if admin/debug and support workflows can expose scoped metadata.",
    "Do not claim instant hard deletion of all records if some audit data has bounded retention.",
    "Do not claim advanced DR/BCP maturity without tested restore procedures.",
    "Do not imply SSO, SCIM, custom key management, or formal penetration-testing programs unless they truly exist.",
    "Do not present reminder reliability as perfect; present it as monitored, audited, retried, and operationally controlled."
  ]
};

export const trustRoadmapFastestWins: SecurityQuestionnaireSection = {
  title: "Roadmap items that strengthen trust fastest",
  summary:
    "These are the fastest improvements that make buyer answers more credible without turning the product into compliance theater.",
  items: [
    "Ship a clean security overview, privacy policy, DPA, and subprocessor list.",
    "Strengthen and document backup/restore procedures for contract and audit data.",
    "Tighten privileged route protections and org-scoped audit coverage on admin, export, billing, and reminder rescue actions.",
    "Make deletion/export handling explicit and operationally repeatable.",
    "Turn security monitoring for auth abuse, webhook anomalies, and tenant-boundary denials into an actual review routine.",
    "Keep the role model simple and well-documented rather than adding fake enterprise permission complexity."
  ]
};

