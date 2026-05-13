export type PerformanceTestArea = {
  area: string;
  whatToMeasure: string[];
  whatToSimulate: string[];
  thresholds: string[];
  performanceRisks: string[];
  whatCanWaitVsMustBeTestedEarly: string[];
};

export const performanceTestingAreas: PerformanceTestArea[] = [
  {
    area: "contract list loading",
    whatToMeasure: [
      "time to first meaningful table render",
      "server query latency for paginated contract lists",
      "filter and sort response time on realistic portfolios"
    ],
    whatToSimulate: [
      "orgs with 100, 500, and 2,000 tracked contracts",
      "mixed statuses, owners, and date distributions",
      "cold and warm list-page loads"
    ],
    thresholds: [
      "interactive first list view under 2 seconds for typical SMB/mid-market orgs",
      "filter/sort interactions under 1 second on common datasets",
      "no catastrophic degradation at larger org sizes"
    ],
    performanceRisks: [
      "unindexed filters make the product feel spreadsheet-slow",
      "list rendering becomes too heavy as org data grows",
      "detail navigation inherits table latency and hurts workflow speed"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: realistic list load with filters and status distributions",
      "Can wait: extreme enterprise-scale portfolios far above current target ICP"
    ]
  },
  {
    area: "dashboard queries",
    whatToMeasure: [
      "dashboard server-render latency",
      "time to visible KPI cards and action panels",
      "query cost for due-soon, review, and failure summary sections"
    ],
    whatToSimulate: [
      "new empty workspace",
      "mid-sized active workspace with due-soon contracts and failures",
      "large workspace with many reminders, failures, and review-needed contracts"
    ],
    thresholds: [
      "dashboard initial render under 2 seconds for normal active orgs",
      "critical cards visible quickly even if lower-priority panels load later",
      "admin-heavy widgets must not block the main workflow summary"
    ],
    performanceRisks: [
      "dashboard becomes a report page that feels heavy on every login",
      "aggregation queries scale badly with reminder and notification history",
      "non-essential admin or strategy content slows core operational views"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: operational dashboard loads for active orgs",
      "Can wait: non-core internal strategy/admin content scaling"
    ]
  },
  {
    area: "bulk import processing",
    whatToMeasure: [
      "time to create import job",
      "row processing throughput",
      "time to final job status for moderate and large files"
    ],
    whatToSimulate: [
      "100-row, 1,000-row, and 5,000-row import files",
      "clean files vs mixed-validity files with row-level failures",
      "imports that approach or exceed contract-cap limits"
    ],
    thresholds: [
      "job creation should feel immediate",
      "moderate imports should complete within an operator-tolerable window",
      "large imports should not time out or leave ambiguous status"
    ],
    performanceRisks: [
      "large imports block request lifecycle or exhaust memory",
      "row-level validation makes imports too slow for realistic spreadsheet migrations",
      "partial-failure handling degrades disproportionately on dirty files"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: moderate imports with partial failures and cap checks",
      "Can wait: highly optimized extreme-row-count tuning beyond target customer reality"
    ]
  },
  {
    area: "export generation",
    whatToMeasure: [
      "CSV generation latency",
      "XLSX generation latency and memory usage",
      "time to first byte for exports on realistic datasets"
    ],
    whatToSimulate: [
      "small, medium, and large export sets",
      "rows with long notes, evidence snippets, and optional fields",
      "concurrent export requests across different orgs"
    ],
    thresholds: [
      "typical exports should feel near-immediate",
      "large exports should complete without worker or route failure",
      "export memory usage should not threaten app stability"
    ],
    performanceRisks: [
      "XLSX generation is disproportionately expensive",
      "large exports block the event loop or spike memory",
      "sanitization and formatting costs scale worse than expected"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: medium and large export generation on real contract shapes",
      "Can wait: advanced streaming/export offload work until usage proves need"
    ]
  },
  {
    area: "reminder cron throughput",
    whatToMeasure: [
      "reminders processed per run",
      "cron route execution time",
      "notification dispatch concurrency and backlog growth"
    ],
    whatToSimulate: [
      "light, moderate, and heavy due-reminder batches",
      "mixed success and failure outcomes in one cron run",
      "concurrent orgs with overlapping due reminders"
    ],
    thresholds: [
      "cron processing must finish comfortably within the scheduling window",
      "backlog should not grow across normal operating days",
      "throughput should support expected reminder peaks without duplicate risk"
    ],
    performanceRisks: [
      "cron runs overlap and create duplicate or delayed sends",
      "one noisy org starves the rest of the queue",
      "provider failures slow throughput enough to miss SLAs"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: cron throughput at expected peak load with failures mixed in",
      "Can wait: sophisticated queue partitioning until real volume justifies it"
    ]
  },
  {
    area: "digest sending",
    whatToMeasure: [
      "eligible-org digest processing time",
      "summary generation time",
      "send throughput across many orgs"
    ],
    whatToSimulate: [
      "small set of eligible orgs",
      "dozens or hundreds of eligible orgs in one digest window",
      "orgs with empty vs heavy due-soon portfolios"
    ],
    thresholds: [
      "digest generation should not materially delay reminder processing",
      "cron or manual digest sends should complete predictably within the batch window",
      "empty-state digests should be cheap to skip or render"
    ],
    performanceRisks: [
      "digest summary queries fan out across too many contracts per org",
      "digest runs compete with reminder cron for resources",
      "empty or low-value digests still consume heavy compute"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: digest batch generation for realistic paid org counts",
      "Can wait: very large digest volume optimization if feature adoption is still limited"
    ]
  },
  {
    area: "admin/debug views",
    whatToMeasure: [
      "load time for failure lists and debug panels",
      "query latency for recent notification and import history",
      "responsiveness under incident-level failure volume"
    ],
    whatToSimulate: [
      "normal steady-state failure volume",
      "incident spike with many failed reminders/notifications",
      "large import history and error logs"
    ],
    thresholds: [
      "admin views should stay usable during incidents",
      "failure lists must load fast enough for operator triage",
      "debug actions must not wait behind heavy historical queries"
    ],
    performanceRisks: [
      "incident view is slowest exactly when operators need it most",
      "admin pages over-query logs and time out under failure spikes",
      "debug rendering becomes noisy and expensive with large history"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: incident-mode admin usability with realistic failed log volumes",
      "Can wait: deeply optimized archival/history views"
    ]
  },
  {
    area: "settings and billing endpoints",
    whatToMeasure: [
      "settings page load latency",
      "settings save latency",
      "checkout and billing portal route responsiveness"
    ],
    whatToSimulate: [
      "admin updating org settings",
      "billing CTA clicks under normal and error conditions",
      "multi-org users switching contexts before billing actions"
    ],
    thresholds: [
      "settings loads and saves should feel instant enough for admin trust",
      "billing routes should return or fail quickly",
      "commercial actions should never feel hung or ambiguous"
    ],
    performanceRisks: [
      "slow settings saves undermine confidence in org configuration",
      "billing route latency hurts conversion and support load",
      "extra billing/provider checks create fragile interactions"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: settings save and checkout start performance",
      "Can wait: less-frequent edge billing paths beyond main upgrade and manage flows"
    ]
  },
  {
    area: "concurrent org usage",
    whatToMeasure: [
      "throughput under simultaneous list, dashboard, import, and cron activity",
      "contention effects on shared database queries",
      "error rate during concurrent normal operations"
    ],
    whatToSimulate: [
      "multiple active orgs working at once",
      "imports running while reminders and exports are happening",
      "admins using debug views during operational load"
    ],
    thresholds: [
      "normal concurrent usage should not materially degrade trust-sensitive flows",
      "cron and reminder processing must remain stable during interactive user traffic",
      "error rate should stay low under realistic concurrency"
    ],
    performanceRisks: [
      "background jobs starve interactive UX",
      "one org's heavy import or export affects others",
      "shared bottlenecks create noisy-neighbor behavior"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: realistic overlap of interactive usage plus cron/import work",
      "Can wait: complex multi-region or hyperscale concurrency concerns"
    ]
  },
  {
    area: "large org data scenarios",
    whatToMeasure: [
      "query latency at upper-end target contract counts",
      "render and payload size behavior with larger contract portfolios",
      "job runtimes for imports/exports/reminder batches in large orgs"
    ],
    whatToSimulate: [
      "orgs near or above Growth/Portfolio thresholds",
      "dense reminder history and notification logs",
      "many due-soon contracts in one window"
    ],
    thresholds: [
      "target ICP scale must remain operationally usable",
      "upper-end orgs should degrade gracefully, not fall off a cliff",
      "large-org admin and export flows should remain supportable"
    ],
    performanceRisks: [
      "product works for demos but slows badly at real paid-customer scale",
      "large orgs become support-heavy due to latency and timeout issues",
      "portfolio-level success is blocked by untested query growth"
    ],
    whatCanWaitVsMustBeTestedEarly: [
      "Must test early: upper-bound target customer sizes, not toy datasets",
      "Can wait: enterprise-scale scenarios outside the current wedge"
    ]
  }
];

export const performanceTestingPriorities = {
  mustTestEarly: [
    "contract list loading on realistic portfolios",
    "dashboard queries for active orgs",
    "bulk import processing with mixed-validity files",
    "export generation on medium and large datasets",
    "reminder cron throughput with failures mixed in",
    "settings save and checkout-start responsiveness",
    "concurrent org usage with imports plus cron activity",
    "large org scenarios at the upper end of target ICP"
  ],
  canWait: [
    "extreme enterprise-scale scenarios outside current ICP",
    "deep archive/history optimization",
    "highly optimized streaming/offloaded export architecture before usage proves need",
    "advanced queue partitioning or distributed cron orchestration"
  ]
};

