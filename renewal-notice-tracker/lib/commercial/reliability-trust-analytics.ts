export type ReliabilityMetricDefinition = {
  name: string;
  category:
    | "reminder_delivery"
    | "cron_processing"
    | "retry"
    | "extraction_failure"
    | "low_confidence_extraction"
    | "review_completion"
    | "duplicate_suppression"
    | "admin_debug"
    | "trust_quality"
    | "alert_threshold";
  formula: string;
  requiredEventsOrLogs: string[];
  warningThreshold: string;
  whyItMatters: string;
};

export type ReliabilityDashboardSection = {
  title: string;
  purpose: string;
  widgets: string[];
};

export type OperationalEscalationRule = {
  trigger: string;
  severity: "warning" | "high" | "critical";
  owner: string;
  action: string;
};

export const reliabilityTrustMetrics: ReliabilityMetricDefinition[] = [
  {
    name: "Reminder delivery success rate",
    category: "reminder_delivery",
    formula: "Successful reminder deliveries divided by total reminder delivery attempts in the period.",
    requiredEventsOrLogs: ["reminder_sent", "reminder_failed", "notification_logs"],
    warningThreshold: "Warning below 98%, critical below 95%.",
    whyItMatters: "If reminders do not send reliably, the core promise of the product breaks."
  },
  {
    name: "Reminder duplicate suppression rate",
    category: "duplicate_suppression",
    formula: "Suppressed duplicate reminder attempts divided by total duplicate-eligible reminder attempts.",
    requiredEventsOrLogs: ["reminder_sent", "reminder_failed", "notification_logs", "dedupe keys"],
    warningThreshold: "Warning if duplicates escape suppression more than rarely; critical if duplicate sends are user-visible.",
    whyItMatters: "Duplicate reminders destroy trust quickly even if overall delivery is high."
  },
  {
    name: "Cron job success rate",
    category: "cron_processing",
    formula: "Successful cron runs divided by scheduled cron runs for reminder and digest processors.",
    requiredEventsOrLogs: ["cron run logs", "send_reminders_route logs", "monthly_digest_route logs"],
    warningThreshold: "Warning below 99%, critical below 97%.",
    whyItMatters: "Silent cron failure means the workflow stops working before most users notice."
  },
  {
    name: "Cron lag",
    category: "cron_processing",
    formula: "Median and p95 difference between scheduled run time and actual processing start time.",
    requiredEventsOrLogs: ["cron run logs", "job timestamps"],
    warningThreshold: "Warning when lag exceeds one expected run interval; critical when lag threatens deadline timing.",
    whyItMatters: "Late reminders can be as bad as failed reminders."
  },
  {
    name: "Retry recovery rate",
    category: "retry",
    formula: "Failed reminder or notification attempts later recovered by retry divided by total failed attempts.",
    requiredEventsOrLogs: ["reminder_failed", "reminder_sent", "notification_logs", "attempt_count"],
    warningThreshold: "Warning if retries recover too little; critical if failures persist across retry windows.",
    whyItMatters: "Retries should rescue transient failures without hiding systemic issues."
  },
  {
    name: "Mean retries per successful delivery",
    category: "retry",
    formula: "Total retry attempts for successful deliveries divided by successful deliveries.",
    requiredEventsOrLogs: ["notification_logs", "attempt_count"],
    warningThreshold: "Warning if retries rise steadily over baseline.",
    whyItMatters: "Rising retries often predict deliverability or infrastructure issues before outright failure spikes."
  },
  {
    name: "Extraction failure rate",
    category: "extraction_failure",
    formula: "Contracts with extraction_failed divided by all extraction attempts.",
    requiredEventsOrLogs: ["extraction_completed", "extraction_failed", "extraction failure logs"],
    warningThreshold: "Warning if failure rate rises above known baseline; critical if failures cluster on common input types.",
    whyItMatters: "Extraction failure blocks activation and increases support cost."
  },
  {
    name: "Low-confidence extraction rate",
    category: "low_confidence_extraction",
    formula: "Contracts with confidence below threshold divided by all completed extractions.",
    requiredEventsOrLogs: ["extraction_completed", "confidence_score"],
    warningThreshold: "Warning if low-confidence share rises materially or stays high on common templates.",
    whyItMatters: "Low confidence creates review burden and weakens trust in extracted dates."
  },
  {
    name: "Review completion rate for extracted contracts",
    category: "review_completion",
    formula: "Extracted contracts reviewed within SLA divided by all extracted contracts needing review.",
    requiredEventsOrLogs: ["contract_review_completed", "needs_review state", "extraction_completed"],
    warningThreshold: "Warning if review completion drops or backlog ages beyond workflow expectations.",
    whyItMatters: "Trust is earned when uncertain data actually gets reviewed."
  },
  {
    name: "Time to reviewed contract",
    category: "review_completion",
    formula: "Median time from extraction completion to contract review completion.",
    requiredEventsOrLogs: ["extraction_completed", "contract_review_completed"],
    warningThreshold: "Warning if median or p95 time grows enough to delay activation and reminders.",
    whyItMatters: "Slow review delays value realization and makes obligations less trustworthy."
  },
  {
    name: "Admin/debug rescue rate",
    category: "admin_debug",
    formula: "Failed operational items successfully resolved after admin intervention divided by total admin rescue actions.",
    requiredEventsOrLogs: ["admin_debug_viewed", "reminder_rerun_triggered", "resend_notification_action logs"],
    warningThreshold: "Warning if rescue success is low or manual rescues are becoming common.",
    whyItMatters: "Admin tooling should solve incidents, not become a permanent operating crutch."
  },
  {
    name: "Manual rescue volume",
    category: "admin_debug",
    formula: "Count of admin reruns, resends, or manual recovery actions per week.",
    requiredEventsOrLogs: ["reminder_rerun_triggered", "resend_notification_action logs", "admin_debug_viewed"],
    warningThreshold: "Warning if volume trends upward for multiple weeks.",
    whyItMatters: "Rising manual rescue load is an early sign of reliability debt."
  },
  {
    name: "Review correction rate",
    category: "trust_quality",
    formula: "Corrected extracted fields divided by reviewed extracted fields or reviewed contracts.",
    requiredEventsOrLogs: ["contract_review_completed", "field_corrections_count"],
    warningThreshold: "Warning if correction rate spikes unexpectedly on common sources.",
    whyItMatters: "High correction can mean weak extraction trust; near-zero can mean weak review quality."
  },
  {
    name: "Wrong-behavior incident rate",
    category: "trust_quality",
    formula: "Incidents involving wrong dates, wrong recipients, duplicates, or incorrect reminder timing divided by active workspaces.",
    requiredEventsOrLogs: ["workflow_error_recorded", "support tags", "admin debug notes"],
    warningThreshold: "Critical if any class of wrong-behavior incidents becomes recurring.",
    whyItMatters: "Trust fails faster on wrong behavior than on visible failure."
  },
  {
    name: "Visibility of failed work rate",
    category: "alert_threshold",
    formula: "Operational failures visible in admin or alerting systems divided by total failures observed later through support or manual discovery.",
    requiredEventsOrLogs: ["error logs", "support cases", "admin debug events"],
    warningThreshold: "Critical if failures are discovered by customers before the team sees them.",
    whyItMatters: "Invisible failure is more dangerous than noisy failure."
  }
];

export const reliabilityDashboards: ReliabilityDashboardSection[] = [
  {
    title: "Reminder reliability",
    purpose: "Monitor core reminder delivery and duplicate behavior.",
    widgets: [
      "reminder delivery success rate",
      "duplicate suppression rate",
      "failed reminders by channel",
      "recipient error patterns"
    ]
  },
  {
    title: "Cron and retry operations",
    purpose: "Monitor scheduler health, processing lag, and retry effectiveness.",
    widgets: [
      "cron success rate",
      "cron lag p50 and p95",
      "retry recovery rate",
      "mean retries per successful delivery"
    ]
  },
  {
    title: "Extraction and review trust",
    purpose: "Monitor extraction reliability, confidence, review throughput, and trust quality.",
    widgets: [
      "extraction failure rate",
      "low-confidence extraction rate",
      "review completion rate",
      "time to reviewed contract",
      "review correction rate"
    ]
  },
  {
    title: "Admin and incident response",
    purpose: "Monitor whether failures are visible and whether manual rescue is increasing.",
    widgets: [
      "manual rescue volume",
      "admin/debug rescue rate",
      "wrong-behavior incident rate",
      "visibility of failed work rate"
    ]
  }
];

export const operationalEscalationRules: OperationalEscalationRule[] = [
  {
    trigger: "Reminder delivery success rate falls below warning threshold for one review cycle.",
    severity: "warning",
    owner: "Ops or engineering on-call",
    action: "Investigate channel-specific delivery patterns and retry backlog."
  },
  {
    trigger: "Reminder delivery success rate falls below critical threshold or duplicate sends are confirmed.",
    severity: "critical",
    owner: "Engineering lead and ops owner",
    action: "Escalate immediately, pause risky sends if needed, and review duplicate suppression logic."
  },
  {
    trigger: "Cron lag exceeds one run interval or cron success rate drops materially.",
    severity: "high",
    owner: "Engineering",
    action: "Inspect scheduler health, queue saturation, and missed processing windows."
  },
  {
    trigger: "Extraction failure or low-confidence rate spikes on common document types.",
    severity: "high",
    owner: "Product and engineering",
    action: "Audit source patterns, provider behavior, and review burden; communicate to support if needed."
  },
  {
    trigger: "Review completion rate drops below SLA for newly extracted contracts.",
    severity: "warning",
    owner: "Product and customer success",
    action: "Check whether trust messaging, review UX, or import quality is slowing activation."
  },
  {
    trigger: "Manual rescue volume trends upward for multiple weeks.",
    severity: "high",
    owner: "Ops and product",
    action: "Treat as systemic reliability debt and prioritize root-cause fixes over repeated manual intervention."
  },
  {
    trigger: "Wrong-behavior incidents recur in the same class.",
    severity: "critical",
    owner: "Engineering lead, product lead, and support lead",
    action: "Open incident review, identify blast radius, and ship remediation before adding adjacent functionality."
  }
];
