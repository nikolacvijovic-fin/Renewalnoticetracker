# Current Product Truth

NoticeControl currently ships one narrow product:

- upload or fixed-template import
- review P0
- assign owner
- trusted reminder
- acknowledgment
- decision
- closure

Current customer-facing runtime includes only:

- the shipped kernel in [SHIPPED_KERNEL.md](../SHIPPED_KERNEL.md)
- the platform module/add-on registry in [PLATFORM_MODULE_REGISTRY.md](PLATFORM_MODULE_REGISTRY.md)
- shipped-first scope in [SHIPPED_FIRST_SCOPE.md](../SHIPPED_FIRST_SCOPE.md)
- early role model in [EARLY_RBAC.md](../EARLY_RBAC.md)
- Phase-1 release gates in [PHASE1_DEFINITION_OF_DONE.md](../PHASE1_DEFINITION_OF_DONE.md) and [RELEASE_QUALITY_GATES.md](../RELEASE_QUALITY_GATES.md)
- market expansion boundary in [MARKET_EXPANSION_BOUNDARY.md](MARKET_EXPANSION_BOUNDARY.md)

Gated intelligence, financial exposure, procurement analytics, exports, OCR/import, reminders, billing, and internal operations may ship only as renewal-control modules classified in the registry. Enterprise controls, broad integrations, advanced analytics, and full CLM remain deferred, experimental, or excluded until the registry and release gates explicitly promote them.

Customer first-value onboarding is shipped as a renewal-control checklist. Enterprise onboarding readiness is a support-safe launch model in [ENTERPRISE_ONBOARDING_READINESS.md](ENTERPRISE_ONBOARDING_READINESS.md): it can summarize pilot, paid launch, and enterprise launch categories, but it does not ship customer success health scores, support impersonation, provider-backed SSO login, or live SCIM provisioning endpoints.

Market profile support is infrastructure only. The current shipped market is `global/default`; planned market compatibility is not runtime permission. Market activation approval contracts are future infrastructure only: they model organization-specific, time-bound legal/payment/provider/data review, but they do not ship local-market activation today. Restricted markets require legal/compliance review and cannot self-activate. The market profile layer must not be used for sanctions evasion, provider restriction workarounds, or claims that restricted markets are supported today.

Anything outside this loop belongs in deferred capability records, future activation rules, or reference-only material.
