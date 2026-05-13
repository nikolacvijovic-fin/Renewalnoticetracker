export type SecurityQaTest = {
  area: string;
  testCase: string;
  severity: "P0" | "P1" | "P2";
  automatedOrManual: "automated" | "manual" | "both";
  releaseBlockingStatus: "blocks_release" | "should_block_for_critical_surfaces" | "non_blocking";
};

export const securityQaPlan: SecurityQaTest[] = [
  {
    area: "auth abuse scenarios",
    testCase:
      "Repeated magic-link requests, expired auth links, replayed auth callbacks, and suspicious sign-in bursts are denied, logged, and rate-limited without leaking session state.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "owner/admin/member role boundaries",
    testCase:
      "Member users are denied admin and owner-only actions server-side even when UI controls are forged, stale pages are reused, or direct route submissions are attempted.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "cross-org access attempts",
    testCase:
      "Direct contract, reminder, import-job, and settings lookups using another organization's identifiers are rejected for both reads and writes.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "export access abuse",
    testCase:
      "Unauthorized or cross-org export requests for CSV/XLSX/ICS are denied without leaking data, filenames, row counts, or partial payloads.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "billing access abuse",
    testCase:
      "Only the correct org owner/admin can open checkout or portal routes, and invalid-plan or cross-org billing attempts fail closed and are audited.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "admin route abuse",
    testCase:
      "Customer admin/debug views and high-power rescue actions stay org-scoped, role-protected, and unavailable to members or stale downgraded sessions.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "internal health route access",
    testCase:
      "The internal health route rejects missing, invalid, or misplaced secrets and does not reveal operational internals beyond the intended trusted caller boundary.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "cron secret misuse",
    testCase:
      "Cron-triggered reminder and digest routes reject bad secrets, ignore replay-style repeated requests safely, and do not leak control-plane details in error responses.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "webhook replay and validation",
    testCase:
      "Billing webhooks validate signatures, reject malformed payloads, tolerate duplicate delivery idempotently, and do not mutate the wrong organization.",
    severity: "P0",
    automatedOrManual: "automated",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "file upload abuse",
    testCase:
      "Oversized, unsupported, corrupt, or content-hostile PDF and DOCX uploads fail safely without parser crashes, unsafe rendering, or sensitive error leakage.",
    severity: "P1",
    automatedOrManual: "both",
    releaseBlockingStatus: "should_block_for_critical_surfaces"
  },
  {
    area: "data leakage through UI",
    testCase:
      "Customer-visible pages, debug panels, and error states never render secrets, raw provider payloads, cross-org metadata, or contract content outside the current permission boundary.",
    severity: "P0",
    automatedOrManual: "both",
    releaseBlockingStatus: "blocks_release"
  },
  {
    area: "audit log visibility correctness",
    testCase:
      "Only the right org-scoped privileged users can view security-relevant audit data, and audit views redact secrets while preserving traceability for sensitive actions.",
    severity: "P1",
    automatedOrManual: "both",
    releaseBlockingStatus: "should_block_for_critical_surfaces"
  }
];

export const securityQaImmediatePriorities = [
  "Automate P0 denial-path tests for auth abuse, role boundaries, cross-org lookups, exports, billing, admin routes, webhooks, and cron routes.",
  "Add manual QA for data leakage through UI, including stale sessions, copied URLs, and admin/debug visibility checks.",
  "Treat any successful cross-org read/write, unauthorized billing access, or secret-protected endpoint bypass as a hard release blocker.",
  "Make webhook replay/idempotency and cron secret validation part of the default backend release suite."
];

