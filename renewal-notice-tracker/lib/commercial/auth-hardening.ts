export type AuthHardeningSection = {
  title: string;
  summary: string;
  items: string[];
};

export const authCurrentStateReview = {
  likelyCurrentReality: [
    "Passwordless email-link sign-in is the primary supported auth flow today.",
    "Sign-up uses the same OTP flow with shouldCreateUser enabled.",
    "Auth callback exchanges Supabase code for session and then redirects into the app.",
    "Password reset and password update flows exist as scaffolds even though passwordless appears to be the main path.",
    "Protected dashboard flows rely on requireUser, requireOrganization, and role-gated helpers."
  ],
  alreadyStrong: [
    "Auth is delegated to Supabase instead of custom session code.",
    "Email payload validation exists for sign-in, sign-up, and password reset.",
    "The app already uses httpOnly marketing attribution cookies and server-side auth actions.",
    "Protected dashboard flows are already server-gated."
  ],
  likelyGaps: [
    "The callback redirect model was permissive enough to require explicit local-path validation.",
    "Rate limiting and abuse controls are not visible in the auth actions.",
    "Suspicious auth events do not appear to be systematically logged.",
    "Current org context is still coupled to first-membership lookup instead of explicit active-org selection."
  ],
  trustSensitiveRisks: [
    "Magic-link abuse and inbox flooding.",
    "Open redirect or unsafe post-auth redirect behavior.",
    "Weak session-to-org binding in multi-org accounts.",
    "Password reset scaffolds existing without a deliberate policy for when password auth is actually allowed."
  ]
};

export const authHardeningPlan: AuthHardeningSection[] = [
  {
    title: "Magic-link security",
    summary: "Passwordless is fine here, but it must be treated like a privileged auth surface rather than a convenience widget.",
    items: [
      "Rate-limit sign-in and sign-up link issuance by email, IP, and organizationless session fingerprint.",
      "Use generic success responses so account existence is not trivially enumerable.",
      "Keep link lifetime short and treat link redemption as a security-significant event.",
      "Alert on repeated magic-link sends to the same address or high-volume sends from one source."
    ]
  },
  {
    title: "Session handling",
    summary: "The session model should be server-authoritative, org-aware, and resilient to context drift.",
    items: [
      "Bind every privileged flow to authenticated user plus explicit active organization context.",
      "Revalidate membership and role server-side for owner/admin actions, not just page entry.",
      "Rotate or refresh session state cleanly after auth callback and any future privilege-changing event.",
      "Treat session-to-org confusion as a security issue, not a UX bug."
    ]
  },
  {
    title: "Redirect safety",
    summary: "Post-auth redirects must be local-only and intentionally scoped.",
    items: [
      "Allow only relative in-app redirects beginning with a single slash.",
      "Reject protocol-relative or absolute URLs and fall back to /dashboard.",
      "Audit unexpected redirect targets as suspicious auth events if you later allow richer return URLs."
    ]
  },
  {
    title: "Password reset safety",
    summary: "Reset flows should exist only if password auth is truly supported and intentionally enabled.",
    items: [
      "If password auth is optional or future-only, make that policy explicit in code and docs.",
      "Use generic reset responses and avoid revealing account existence.",
      "Require strong password rules and session invalidation after password changes if password auth becomes primary."
    ]
  },
  {
    title: "Account bootstrap flow",
    summary: "The first successful sign-in should create identity safely without silently creating weak organization context.",
    items: [
      "Bootstrap organization setup only after verified auth and with explicit first-org creation flow.",
      "Log first-login, first-org-created, and bootstrap failures as security-relevant lifecycle events.",
      "Avoid inferring long-term org context from the first membership forever."
    ]
  },
  {
    title: "Session fixation and token hygiene",
    summary: "The auth callback and future password flows should avoid sticky or confused session state.",
    items: [
      "Ensure callback exchange writes the fresh Supabase session and uses safe redirect fallback.",
      "Do not carry untrusted redirect parameters or stale state across auth completion.",
      "Invalidate or refresh client-visible session assumptions after password changes or membership changes."
    ]
  },
  {
    title: "Anti-abuse and rate limiting",
    summary: "Abuse control matters even for B2B SaaS because auth endpoints are cheap to attack.",
    items: [
      "Rate-limit sign-in, sign-up, and password reset actions by IP and email address.",
      "Introduce stricter throttles after repeated auth attempts or repeated link sends.",
      "Consider CAPTCHA only if abuse appears; do not add friction before rate limits and logging are in place."
    ]
  },
  {
    title: "Suspicious auth event logging",
    summary: "You need enough auth telemetry to investigate abuse without turning auth into analytics theater.",
    items: [
      "Track magic-link requested, magic-link redeemed, password reset requested, password updated, sign-out, and auth callback failed.",
      "Track suspicious patterns like redirect sanitization fallback, repeated sends, repeated failures, and sign-in from new org bootstrap state.",
      "Record actor, email hash or normalized email identifier where appropriate, IP or request fingerprint, and result."
    ]
  },
  {
    title: "Fallback auth model decisions",
    summary: "Do not accidentally support two auth philosophies at once.",
    items: [
      "Default to passwordless as the primary model until there is a clear need for password auth.",
      "If password auth is later enabled, make it an explicit product decision with stronger session and reset controls.",
      "Avoid partial password support that exists only as a scaffold but looks production-ready."
    ]
  },
  {
    title: "UX and security trade-offs",
    summary: "The right trade-off here is low-friction auth with strict server-side controls and low information leakage.",
    items: [
      "Generic success messaging is better than revealing whether an account exists.",
      "Passwordless is a good UX for SMB ops users if abuse controls are strong.",
      "Do not add enterprise auth complexity before active-org context, logging, and rate limits are correct."
    ]
  }
];

export const authRecommendations = {
  bestAuthFlow:
    "Use passwordless email-link sign-in as the primary flow, create users through the same verified link flow, keep callback redirects local-only, and complete organization bootstrap only after verified sign-in.",
  bestSessionCookieSecurityPosture: [
    "Use server-managed Supabase session cookies only.",
    "Prefer secure, httpOnly, sameSite=lax cookies for app sessions and attribution cookies.",
    "Bind sensitive server actions to current user, explicit active organization, and role revalidation.",
    "Treat membership changes and future password changes as events that require session-context refresh."
  ],
  rateLimitRecommendations: [
    "Sign-in link requests: per-IP and per-email throttles with short rolling windows.",
    "Sign-up link requests: stricter throttles than sign-in because they can create support noise and abuse risk.",
    "Password reset: same generic responses plus per-email and per-IP throttles.",
    "Auth callback failures: monitor bursts because they can indicate replay or malformed-link abuse."
  ],
  auditSecurityEventsToTrack: [
    "auth.magic_link_requested",
    "auth.magic_link_redeemed",
    "auth.callback_failed",
    "auth.redirect_sanitized",
    "auth.password_reset_requested",
    "auth.password_updated",
    "auth.sign_out",
    "auth.bootstrap_started",
    "auth.bootstrap_completed",
    "auth.suspicious_rate_limit_triggered"
  ],
  topAuthRisks: [
    "Open or unsafe auth redirects.",
    "Magic-link abuse and inbox flooding.",
    "Weak multi-org session context.",
    "Generic auth success not being rate-limited enough to prevent abuse.",
    "Password reset scaffolds drifting into production without a deliberate password-auth policy.",
    "Missing suspicious auth-event logs.",
    "Session fixation or stale-org context after auth transitions.",
    "Auth flows revealing too much about account existence.",
    "Weak owner/admin revalidation after sign-in for privileged flows.",
    "Assuming Supabase auth alone solves application authorization."
  ],
  topAuthFixes: [
    "Keep callback redirects local-only with a safe fallback.",
    "Add explicit active-org selection and binding after auth.",
    "Add per-IP and per-email rate limits on sign-in, sign-up, and reset actions.",
    "Log suspicious auth events and callback failures.",
    "Use generic responses for sign-in and reset to reduce enumeration value.",
    "Decide clearly whether password auth is supported now or only scaffolded.",
    "Refresh or revalidate session context on privilege-sensitive transitions.",
    "Recheck owner/admin authority in every privileged server action.",
    "Instrument auth bootstrap milestones and failures.",
    "Document auth behavior so product UX and security posture stay aligned."
  ]
};
