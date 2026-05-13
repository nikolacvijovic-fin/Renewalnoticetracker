export type ReliabilityTestArea = {
  area: string;
  failureModes: string[];
  testsNeeded: string[];
  observabilityChecks: string[];
  dataIntegrityChecks: string[];
  releaseSeverity: "P0" | "P1" | "P2";
};

export const reliabilityTestingAreas: ReliabilityTestArea[] = [
  {
    area: "due reminder processing",
    failureModes: [
      "due reminders are skipped",
      "non-due reminders are processed early",
      "mixed reminder batches produce inconsistent state transitions"
    ],
    testsNeeded: [
      "integration test: cron processes only due pending reminders",
      "integration test: successful due reminder processing updates status and logs send attempt",
      "integration test: unauthorized cron request is rejected quickly"
    ],
    observabilityChecks: [
      "failed and sent reminder counts are visible in admin/debug panels",
      "cron route failures are logged with enough context to identify affected reminders",
      "dashboard/admin surfaces show pending vs failed reminder volume"
    ],
    dataIntegrityChecks: [
      "only reminders matching due criteria are mutated",
      "processed reminders keep correct attempt count and sent timestamps",
      "notification log links back to reminder and organization"
    ],
    releaseSeverity: "P0"
  },
  {
    area: "retry scheduling",
    failureModes: [
      "failed reminders never get retried",
      "retry timing is wrong or drifts too aggressively",
      "retry state is overwritten incorrectly after repeated failures"
    ],
    testsNeeded: [
      "integration test: failed reminder moves to expected retry state",
      "integration test: next_retry_at follows retry policy",
      "unit/integration test: retry count increments without corrupting status"
    ],
    observabilityChecks: [
      "admin panel shows attempt count and next retry time",
      "retry failures are distinguishable from first-attempt failures",
      "operators can see reminders stuck in repeated retry loops"
    ],
    dataIntegrityChecks: [
      "attempt_count increments deterministically",
      "next_retry_at is populated only for retryable failures",
      "terminal failure states do not keep retry metadata inconsistently"
    ],
    releaseSeverity: "P0"
  },
  {
    area: "duplicate suppression",
    failureModes: [
      "same reminder sends twice",
      "manual resend or rerun collides with scheduled processing",
      "duplicate notification logs trigger extra sends"
    ],
    testsNeeded: [
      "integration test: already-sent reminder is not re-sent",
      "integration test: duplicate processing attempts do not create duplicate notifications",
      "integration test: rerun/resend paths stay single-shot and auditable"
    ],
    observabilityChecks: [
      "duplicate suppression events or skipped sends are visible to operators",
      "notification logs can be correlated to reminder state history",
      "admin rescue actions leave clear audit traces"
    ],
    dataIntegrityChecks: [
      "duplicate sends do not create multiple sent states for same reminder instance",
      "notification logs preserve one-to-many history without corrupting reminder status",
      "idempotency boundaries are stable across retries and reruns"
    ],
    releaseSeverity: "P0"
  },
  {
    area: "resend flows",
    failureModes: [
      "resend action is unavailable for failed notifications",
      "resend sends wrong content or wrong destination",
      "resend creates hidden duplicates without audit visibility"
    ],
    testsNeeded: [
      "integration test: resend action is available only for failed notification logs",
      "integration test: resend preserves correct reminder and destination context",
      "permissions test: resend action is admin-only and org-scoped"
    ],
    observabilityChecks: [
      "resend attempts appear in notification log history",
      "operator can distinguish resend from initial send",
      "failed resend keeps visible error details"
    ],
    dataIntegrityChecks: [
      "resend does not mutate unrelated reminder rows",
      "destination and channel remain tied to original notification intent unless explicitly changed",
      "resend history remains attached to correct organization and reminder"
    ],
    releaseSeverity: "P1"
  },
  {
    area: "rerun reminder flows",
    failureModes: [
      "rerun executes on wrong reminder",
      "rerun bypasses duplicate suppression",
      "rerun is triggered by unauthorized users"
    ],
    testsNeeded: [
      "integration test: rerun action targets the requested failed reminder only",
      "permissions test: rerun action requires admin and org ownership",
      "integration test: rerun updates observable state safely"
    ],
    observabilityChecks: [
      "admin can see reminder before and after rerun",
      "rerun is represented in audit/admin logs",
      "failed rerun remains visible with new error context"
    ],
    dataIntegrityChecks: [
      "rerun does not duplicate reminder rows",
      "rerun preserves reminder ownership and contract linkage",
      "attempt and status history remain coherent after rerun"
    ],
    releaseSeverity: "P0"
  },
  {
    area: "failed notification handling",
    failureModes: [
      "notification failures are swallowed silently",
      "provider errors leak unsafe internal details to end users",
      "failed notifications do not create actionable operator records"
    ],
    testsNeeded: [
      "integration test: provider failure records notification log with failed status",
      "unit/integration test: safe error mapping sanitizes internal provider details",
      "integration test: failed notification links back to reminder context"
    ],
    observabilityChecks: [
      "admin surface shows failed notification count and recent failures",
      "error message is visible for operators but sanitized for users",
      "failed notifications are queryable by org and channel"
    ],
    dataIntegrityChecks: [
      "failed log rows include reminder_id, organization context, channel, and destination",
      "error messages are stored safely without breaking log rendering",
      "failure logging does not mark reminder as sent"
    ],
    releaseSeverity: "P0"
  },
  {
    area: "digest cron",
    failureModes: [
      "eligible orgs are skipped",
      "ineligible orgs receive digests",
      "digest cron fails without visibility"
    ],
    testsNeeded: [
      "integration test: digest cron sends only for eligible orgs",
      "integration test: unauthorized digest cron access is rejected",
      "integration test: digest failure is recorded visibly"
    ],
    observabilityChecks: [
      "digest attempts are logged with org and result status",
      "operators can identify orgs skipped due to plan or settings",
      "failed digest sends surface in admin/reliability views"
    ],
    dataIntegrityChecks: [
      "digest send attempts reference correct organization",
      "eligibility logic does not mutate unrelated settings or billing state",
      "duplicate cron runs do not fan out uncontrolled sends"
    ],
    releaseSeverity: "P1"
  },
  {
    area: "digest manual send",
    failureModes: [
      "manual send bypasses plan or role restrictions",
      "manual send summary differs materially from scheduled digest behavior",
      "manual send is not traceable later"
    ],
    testsNeeded: [
      "integration test: manual digest send respects plan and role checks",
      "integration test: manual send uses same summary rules as scheduled digest",
      "permissions test: member cannot trigger org-wide digest send"
    ],
    observabilityChecks: [
      "manual digest sends are distinguishable from cron sends",
      "operator can see who triggered manual send and when",
      "manual failures remain visible in admin surfaces"
    ],
    dataIntegrityChecks: [
      "manual send does not alter digest eligibility state unexpectedly",
      "digest payload reflects current portfolio state consistently",
      "audit trail captures actor and organization context"
    ],
    releaseSeverity: "P1"
  },
  {
    area: "reminder source differences (system vs manual)",
    failureModes: [
      "system-generated and manual reminders are treated interchangeably when they should not be",
      "review regeneration deletes or duplicates manual reminders",
      "source-specific behavior becomes invisible to operators"
    ],
    testsNeeded: [
      "integration test: review regeneration replaces stale system reminders only",
      "integration test: manual reminders survive contract review updates",
      "integration test: reminder source remains visible in persistence and admin views"
    ],
    observabilityChecks: [
      "operators can distinguish manual from system reminders",
      "audit views show source-specific reminder changes",
      "regeneration events explain why system reminders changed"
    ],
    dataIntegrityChecks: [
      "manual reminder rows are preserved across review-driven regeneration",
      "system reminder replacements do not leave orphaned stale rows",
      "source flags remain correct after edits and reruns"
    ],
    releaseSeverity: "P0"
  },
  {
    area: "escalation reminders",
    failureModes: [
      "escalations generate wrong recipients or wrong dates",
      "duplicate escalation recipients receive multiple unnecessary sends",
      "lower plans can use escalation behavior they should not access"
    ],
    testsNeeded: [
      "unit/integration test: escalation generation produces ordered reminder set",
      "integration test: escalation persistence respects plan limits",
      "integration test: duplicate escalation recipients are deduped correctly"
    ],
    observabilityChecks: [
      "escalation reminders are identifiable in contract/reminder views",
      "operators can see escalation chain outcome if sends fail",
      "commercial denials for escalation setup are logged"
    ],
    dataIntegrityChecks: [
      "escalation reminder rows stay linked to source contract and workflow",
      "recipient sets are normalized consistently",
      "saved escalation chain matches configured offsets"
    ],
    releaseSeverity: "P1"
  },
  {
    area: "invalid recipient behavior",
    failureModes: [
      "invalid emails pass through and create send failures later",
      "recipient validation differs between manual reminder, import, and escalation paths",
      "unsafe error messages leak recipient-processing internals"
    ],
    testsNeeded: [
      "unit/integration test: invalid recipient lists are rejected at validation boundary",
      "integration test: malformed imported recipients normalize or fail predictably",
      "integration test: invalid escalation recipient input does not persist partial workflow"
    ],
    observabilityChecks: [
      "validation failures are visible to user and not confused with provider send failures",
      "operators can distinguish invalid-recipient setup issues from delivery outages",
      "recipient-related denial or validation events are logged"
    ],
    dataIntegrityChecks: [
      "invalid recipients do not persist as live reminder destinations",
      "normalized recipients remain consistent across contract, reminder, and notification records",
      "partial invalid lists do not silently degrade into unexpected sends"
    ],
    releaseSeverity: "P1"
  },
  {
    area: "empty-recipient handling",
    failureModes: [
      "reminder is created with no usable recipients",
      "empty-recipient reminders enter cron processing and fail noisily",
      "digest or reminder paths silently no-op without visible warning"
    ],
    testsNeeded: [
      "unit/integration test: empty recipient reminder creation is rejected or handled predictably",
      "integration test: cron skips impossible sends with visible failure state",
      "integration test: digest/send flows handle empty-recipient org config safely"
    ],
    observabilityChecks: [
      "operators can identify empty-recipient failures distinctly",
      "admin views surface reminders blocked by missing destination data",
      "setup issues are visible before send-time where possible"
    ],
    dataIntegrityChecks: [
      "empty-recipient records are not marked sent",
      "invalid send attempts still preserve traceability",
      "no hidden fallback recipient is introduced accidentally"
    ],
    releaseSeverity: "P1"
  },
  {
    area: "traceability/audit logging",
    failureModes: [
      "operators cannot reconstruct what happened to a reminder or digest",
      "critical retries, reruns, denials, and sends have no audit trail",
      "logs exist but miss org, reminder, or actor linkage"
    ],
    testsNeeded: [
      "integration test: send, failure, resend, rerun, and denial paths emit auditable records",
      "integration test: billing/commercial and admin rescue actions include context fields",
      "integration test: log records stay queryable by organization and source entity"
    ],
    observabilityChecks: [
      "admin surfaces expose key history without requiring DB spelunking",
      "audit records distinguish cron, manual, and admin-triggered actions",
      "failure records preserve enough context for support diagnosis"
    ],
    dataIntegrityChecks: [
      "audit rows include organization_id and relevant entity ids",
      "actor metadata is present where user-triggered behavior occurs",
      "log writes do not silently fail on exceptional paths"
    ],
    releaseSeverity: "P0"
  }
];

export const reliabilityReleaseBlockers = [
  "Due reminders can be skipped or processed early without detection.",
  "Retry scheduling is broken or invisible to operators.",
  "Duplicate suppression fails for scheduled, resend, or rerun paths.",
  "Failed notifications do not produce visible, traceable failure records.",
  "Manual reminders are corrupted or deleted by system reminder regeneration.",
  "Rerun or resend actions are not auditable or bypass safety checks.",
  "Empty-recipient or invalid-recipient reminders enter send flow silently.",
  "Digest cron sends for wrong orgs or ineligible plans.",
  "Reminder and notification logs cannot be traced back to the owning org and entity.",
  "Admin/debug surfaces cannot explain what happened after a reminder failure."
];

