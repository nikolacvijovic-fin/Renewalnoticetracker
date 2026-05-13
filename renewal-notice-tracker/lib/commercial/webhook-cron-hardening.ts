export type WebhookCronSection = {
  title: string;
  summary: string;
  items: string[];
};

export const endpointRiskReview: WebhookCronSection[] = [
  {
    title: "Payment webhook routes",
    summary: "Provider webhooks are privileged machine-authenticated mutation routes that can change billing state and therefore entitlement state.",
    items: [
      "Strong today: provider signature validation exists.",
      "Weak today: no visible replay ledger, no clear state-transition ordering protection, and routes previously returned raw error detail.",
      "Danger: duplicate or out-of-order events corrupt subscription state, which then corrupts entitlements.",
      "Fix first: provider event id ledger, generic error responses, and transition validation."
    ]
  },
  {
    title: "Send-reminders cron route",
    summary: "This route can trigger customer-visible outbound effects at scale and must be treated as a privileged machine API.",
    items: [
      "Strong today: shared-secret auth exists.",
      "Weak today: shared secret alone is brittle if leaked, and replay/rerun behavior is not controlled at route level.",
      "Danger: abuse causes spam, duplicated reminders, or operational load spikes.",
      "Fix first: secret rotation, rate limiting, correlation ids, and route-level generic failure responses."
    ]
  },
  {
    title: "Monthly-digest cron route",
    summary: "This route crosses org boundaries internally and sends outbound email, so its blast radius is broad.",
    items: [
      "Strong today: shared-secret auth exists and commercial denial is applied per organization.",
      "Weak today: route-wide failure handling and replay control remain thin.",
      "Danger: replays or repeated calls generate repeated digests or noisy recipient spam.",
      "Fix first: per-run idempotency keying, generic failure responses, and send-volume anomaly alerts."
    ]
  },
  {
    title: "Internal health route",
    summary: "Health routes are often treated casually, but they are effectively privileged observability endpoints.",
    items: [
      "Strong today: owner/admin auth path exists and secret-based machine check exists.",
      "Weak today: secret in query params is still supported and richer snapshot access can be customer-role based.",
      "Danger: health becomes a side-door operational data leak.",
      "Fix first: header-first secret handling, narrower machine response, and stronger split between machine health and customer admin visibility."
    ]
  }
];

export const endpointAuthenticationModel: WebhookCronSection = {
  title: "Authentication model by endpoint",
  summary: "Each endpoint should use the least ambiguous trust model possible.",
  items: [
    "Payment webhooks: provider signature verification plus replay/idempotency ledger; no customer auth path.",
    "Send-reminders cron: machine secret in header only, rate-limited, auditable, and not customer-reachable by role.",
    "Monthly-digest cron: same machine-secret model as reminder cron, plus per-run correlation and anomaly checks.",
    "Internal health route: split into machine-health secret route and separately scoped customer-admin operational snapshot, not one mixed model forever."
  ]
};

export const replayAndIdempotency: WebhookCronSection = {
  title: "Replay and idempotency recommendations",
  summary: "Webhook and cron routes should assume duplicates, retries, and replays are normal.",
  items: [
    "Persist canonical provider event ids for webhooks and reject duplicates safely.",
    "Validate monotonic billing state transitions so older webhook events cannot overwrite newer state.",
    "Use per-run or per-window idempotency keys for cron-triggered digest execution.",
    "Use reminder-run and delivery idempotency keys throughout reminder processing and make route-triggered replays traceable.",
    "Record correlation ids for webhook and cron invocations so retries and failures can be joined without logging secrets."
  ]
};

export const loggingAndAlerting: WebhookCronSection = {
  title: "Logging and alerting recommendations",
  summary: "These routes need enough visibility for incident response without leaking secrets or provider payloads.",
  items: [
    "Log endpoint name, provider or job type, correlation id, result, organization count impact, and failure class.",
    "Never log raw secrets, signature material, provider auth tokens, or full provider payload bodies.",
    "Alert on webhook signature failures, repeated duplicate webhook ids, cron auth failures, and abnormal send volumes.",
    "Alert on repeated monthly-digest execution for the same org cohort inside a short window.",
    "Alert on internal health access failures or unexpected spikes in secret-based hits."
  ]
};

export const abuseScenarios: WebhookCronSection = {
  title: "Top abuse scenarios",
  summary: "The main risks are spam, replay, state corruption, and internal data disclosure.",
  items: [
    "Replayed payment webhooks causing entitlement or billing-state drift.",
    "Leaked cron secret causing repeated reminder or digest runs.",
    "Internal health secret leakage turning the route into a lightweight reconnaissance surface.",
    "Repeated resend/rerun side effects chained from cron or admin rescue flows.",
    "Verbose failure responses helping attackers tune malformed webhook or cron requests."
  ]
};

export const codeLevelHardeningRecommendations: WebhookCronSection = {
  title: "Code-level hardening recommendations",
  summary: "The next concrete changes should narrow trust boundaries and make route behavior safer under failure and abuse.",
  items: [
    "Use generic external error responses on webhook and cron routes; keep detail in server logs only.",
    "Move internal secrets to headers only and deprecate query-param secret use as soon as operationally safe.",
    "Add a webhook event ledger table keyed by provider and event id.",
    "Add per-run idempotency state for monthly digest execution.",
    "Add correlation ids to webhook and cron processing logs and audit trails.",
    "Separate machine-health response from customer-admin operational snapshot paths.",
    "Add rate limiting and auth-failure counters for secret-protected routes.",
    "Treat any future route that triggers outbound sends as a high-trust machine API from day one."
  ]
};
