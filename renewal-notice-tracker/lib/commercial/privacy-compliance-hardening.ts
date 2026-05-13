export type PrivacyComplianceSection = {
  title: string;
  summary: string;
  items: string[];
};

export const dataCategories: PrivacyComplianceSection = {
  title: "Data categories",
  summary: "The product handles several distinct data classes, and each needs its own retention and exposure rules.",
  items: [
    "Identity and membership data: user records, organization memberships, roles, billing contact details, and notification preferences.",
    "Contract source data: uploaded PDFs/DOCX files, manually entered contract fields, counterparties, templates, playbooks, and notes.",
    "Derived contract data: extracted text, extracted metadata, evidence snippets, review corrections, renewal decisions, and status fields.",
    "Operational workflow data: reminders, reminder rules, escalation state, digest settings, notification logs, import jobs, export records, and processing errors.",
    "Commercial and platform data: billing provider ids, subscription state, audit logs, internal admin snapshots, and limited integration endpoints like Slack or Teams webhook configuration."
  ]
};

export const retentionPolicy: PrivacyComplianceSection = {
  title: "Retention policy",
  summary: "Retention should follow the operational wedge, not a vague 'keep everything forever' default.",
  items: [
    "Identity and membership data: retain while the organization is active, plus a short offboarding window for account recovery and billing reconciliation.",
    "Contract source data and reviewed contract records: retain while the customer workspace is active because they are the core service data.",
    "Extracted full text and evidence snippets: retain only as long as they support ongoing review, renewal, and audit needs; do not make them indefinite by default.",
    "Notification logs and delivery traces: retain for a bounded operational and support window, not permanently.",
    "Import/export history and processing errors: retain for a bounded troubleshooting window, then age out or redact aggressively.",
    "Audit logs: retain longer than ordinary operational logs because they support incident response, billing disputes, and trust-sensitive investigations."
  ]
};

export const deletionPolicy: PrivacyComplianceSection = {
  title: "Deletion policy",
  summary: "Deletion should be organization-scoped, documented, and realistic even if some steps are initially manual.",
  items: [
    "Customers should be able to request organization-level export and deletion at offboarding.",
    "Source contract files, extracted text, evidence rows, notes, reminders, import history, export history, and integration config should be deletable as part of org deletion.",
    "Notification logs and processing errors should be deletable on org deletion unless they are retained briefly for legitimate operational or fraud reasons that are documented.",
    "Deletion should propagate across primary data and derivative artifacts, not just the original contract row.",
    "Backups should be handled with a documented lagging-deletion posture instead of pretending they disappear instantly."
  ]
};

export const immutableAuditPolicy: PrivacyComplianceSection = {
  title: "Immutable audit policy",
  summary: "Some records should be preserved longer and treated as append-only because they support trust and accountability.",
  items: [
    "Audit logs for billing changes, role changes, privileged admin actions, rescue actions, settings changes, and security-sensitive denials should be append-only.",
    "Immutable does not mean forever; define a longer retention window than ordinary operational data, but still bounded by documented policy.",
    "Audit entries should not contain secrets or unnecessary document content.",
    "Where deletion conflicts with audit needs, retain minimal event metadata rather than broad customer content."
  ]
};

export const customerFacingControls: PrivacyComplianceSection = {
  title: "Customer-facing controls",
  summary: "Customers need a small set of real controls, not a fake enterprise privacy center.",
  items: [
    "Workspace admins should have visibility into who can access org data and what billing/integration settings exist.",
    "Customers need a documented path to request data export and workspace deletion.",
    "Customers need clear visibility into notification recipients, digest settings, and integration endpoints they have configured.",
    "Customers should see when contract data is extracted but still needs review so privacy and trust expectations stay aligned.",
    "Eventually add self-serve or assisted controls for export and deletion, but document the manual process now."
  ]
};

export const documentationReadiness: PrivacyComplianceSection = {
  title: "Documentation needed",
  summary: "Privacy and compliance readiness here is mostly about disciplined documentation and truthful operating procedures.",
  items: [
    "Privacy policy covering what data is collected, why it is processed, and core subprocessors.",
    "DPA template suitable for SMB and lower mid-market buyers.",
    "Security FAQ covering auth, tenant isolation, document handling, logging, retention, deletion, backups, and incident response basics.",
    "Subprocessor list including hosting, email, AI extraction, billing, and messaging providers where applicable.",
    "Internal retention and deletion runbook so the team can execute what the documents promise."
  ]
};

export const vendorSubprocessorConsiderations: PrivacyComplianceSection = {
  title: "Vendor and subprocessor considerations",
  summary: "The product is only as compliant as the vendors it relies on for storage, auth, billing, email, and extraction.",
  items: [
    "Maintain a current subprocessor list for Supabase, billing providers, email providers, AI/extraction providers, and chat delivery providers.",
    "Ensure vendor use is framed accurately in privacy and security docs instead of vaguely saying 'trusted partners'.",
    "Review which vendors can see raw contract text, extracted text, or billing metadata and document that clearly.",
    "Do not overclaim residency or isolation guarantees that vendor architecture does not support."
  ]
};

export const gdprPracticalExpectations: PrivacyComplianceSection = {
  title: "GDPR-style practical expectations",
  summary: "This product does not need fake enterprise compliance theater, but it does need a credible privacy operating model.",
  items: [
    "Document controller/processor framing at a practical level for customer contracts and user data.",
    "Have a real process for access/export, deletion, and subprocessor disclosure.",
    "Use data minimization language that matches the actual product behavior.",
    "Do not keep sensitive derivative data longer than its operational purpose just because storage is cheap.",
    "Keep auditability and deletion in balance by retaining the minimum event metadata needed for legitimate operational reasons."
  ]
};

export const claimsNotReadyToMake = [
  "Do not claim enterprise-grade compliance maturity if retention, deletion, and subprocessor governance are still mostly informal.",
  "Do not claim instant or fully self-serve deletion if the process is still manual.",
  "Do not claim broad regional data residency guarantees unless the actual vendor stack and deployment model support them.",
  "Do not claim zero human access if internal admin/debug tooling still exists.",
  "Do not claim immutable tamper-proof audit trails if you have not implemented that operationally."
];

export const bestPrivacyComplianceApproach: PrivacyComplianceSection = {
  title: "Best implementation approach",
  summary: "Keep the privacy model narrow, documented, and executable: minimize data, retain deliberately, delete credibly, and avoid overclaiming.",
  items: [
    "Define data categories and retention by category, not one blanket rule.",
    "Create an org-level export and deletion runbook that includes derivative artifacts.",
    "Retain audit events longer than operational logs, but keep them minimal and append-only.",
    "Publish a truthful privacy policy, DPA, subprocessor list, and security FAQ before making ambitious compliance claims.",
    "Use the wedge as the minimization principle: keep only what supports renewal operations, visibility, and accountability."
  ]
};
