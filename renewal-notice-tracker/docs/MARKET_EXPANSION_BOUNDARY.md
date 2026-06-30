# Market Expansion Boundary

NoticeControl currently ships with the `global/default` market profile. The market profile layer is infrastructure for lawful future expansion only. It does not launch restricted markets, route around provider restrictions, or create sanctions-evasion behavior.

Canonical registry: `lib/product/market-profiles.ts`.

## Compatibility Is Not Runtime Permission

Market profiles can express future compatibility, such as a provider or module that may be intended for a planned market later. Compatibility is not runtime permission.

Runtime permission requires all of the following:

- the market status is `shipped`
- the activation policy is `self_serve_allowed`
- compliance review is not required
- the provider or product module is compatible with the market profile

Planned markets such as `us` and `eu` may describe future-compatible providers, but they are not runtime-enabled today. `support_led_only` means support review is required before any future activation work; support-led review does not equal approval.

## Current Shipped Position

- `global` is the only shipped market profile.
- Paddle remains the default self-serve billing provider.
- Manual invoice / wire transfer and PayPal remain support-led exceptions.
- OpenAI-backed AI/OCR and Resend email remain provider-specific runtime paths governed by existing configuration and privacy boundaries.
- Existing runtime behavior is unchanged by the market profile registry.

## Planned And Review Profiles

The registry may contain neutral planning profiles such as:

- `us`
- `eu`
- `manual_invoice_review`
- `restricted_market_review`

These profiles are not customer-facing launch claims. They describe future policy decisions for payment providers, AI/OCR providers, email providers, invoicing, data residency, compliance review, activation, and module availability.

Restricted markets require legal/compliance review and cannot self-activate. The profile named `restricted_market_review` is a denial/review boundary, not a supported market.

## Provider Policy

Market policies can answer:

- which payment providers are allowed
- whether manual invoice is allowed
- whether AI extraction is allowed
- whether OCR is allowed
- whether customer activation requires compliance review
- whether a product module is available in the market
- whether self-serve activation is allowed

Provider policy decisions must return customer-safe reason codes and messages. They must not include provider payloads, payment details, sanctions-screening details, legal documents, secrets, or tokens.

## Product Module Availability

The market profile layer references `docs/PLATFORM_MODULE_REGISTRY.md` and uses module IDs from `lib/product/platform-modules.ts`.

Global/default may allow the currently shipped renewal-control modules. Future enterprise integrations, advanced governance/analytics, and full CLM remain deferred, experimental, or excluded according to the platform module registry.

## Audit And Diagnostics

Future market audit/diagnostic events are contract-shaped only:

- `market.profile_selected`
- `market.activation_requested`
- `market.manual_invoice_review_requested`
- `market.provider_unavailable`
- `market.compliance_review_required`

Safe metadata may include IDs, market ID/status, provider name/kind, activation policy, and reason code. It must never include sensitive documents, payment details, sanctions-screening details, raw customer legal data, provider payloads, secrets, or tokens.

## Promotion Requirements

A future market profile may move toward shipped runtime only after:

- legal/compliance review is complete
- payment, AI/OCR, email, invoicing, tax, and data-residency policies are documented
- provider restrictions are respected
- activation is gated by tested policy helpers
- billing and entitlement behavior still comes from canonical billing truth
- release and scope-freeze tests are updated
- customer-facing docs describe only the exact supported scope

Do not add restricted market support, customer-facing availability claims, or provider workarounds without an explicit release gate and legal/compliance approval.
