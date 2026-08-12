# NoticeControl Platform Module Registry

Canonical code source: `lib/product/platform-modules.ts`.

NoticeControl is currently a focused renewal-control product with gated intelligence and operations modules. Platform expansion must move through this registry before it appears in customer navigation, route behavior, pricing copy, release-critical tests, or support operations.

Enterprise identity/RBAC details live in [ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md](ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md), backed by `lib/product/enterprise-rbac.ts`, `lib/product/enterprise-identity.ts`, `lib/product/enterprise-identity-runtime.ts`, `lib/product/enterprise-identity-schema.ts`, and `lib/product/enterprise-identity-routes.ts`.

Data governance and retention expansion is governed by [DATA_GOVERNANCE_RETENTION_BOUNDARY.md](DATA_GOVERNANCE_RETENTION_BOUNDARY.md), backed by `lib/product/data-governance.ts`.

Public API and integration expansion is governed by [API_AND_INTEGRATION_BOUNDARY.md](API_AND_INTEGRATION_BOUNDARY.md), backed by `lib/product/platform-api.ts`, `lib/product/platform-api-schema.ts`, and `lib/product/platform-api-routes.ts`.

Customer onboarding and support/success operations are governed by [CUSTOMER_ONBOARDING_BOUNDARY.md](CUSTOMER_ONBOARDING_BOUNDARY.md), [SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md](SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md), and [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md), backed by `lib/product/customer-onboarding.ts`, `lib/product/customer-onboarding-progress.ts`, `lib/product/support-success.ts`, and `lib/product/event-taxonomy.ts`.

## Module Classification

| Module ID | Status | Current shipped kernel? | Gate / entitlement source | Required proof |
| --- | --- | --- | --- | --- |
| `core_renewal_control_kernel` | shipped | yes | active org, role checks, shipped action matrix, Starter paid gates where applicable | `test:release-critical`, shipped-kernel boundary tests |
| `contract_intelligence_risk_explanation` | shipped | yes | `risk_badges`, `risk_scores`, shared intelligence access | `test:intelligence-release-gate`, risk-score and surface consistency tests |
| `financial_exposure_intelligence` | shipped | yes | `financial_intelligence`, Growth plan, admin-only access | `test:intelligence-release-gate`, financial exposure/page tests |
| `procurement_vendor_analytics` | shipped | yes | `procurement_analytics`, Growth plan, admin/operator access | `test:intelligence-release-gate`, procurement query/page tests |
| `subscription_usage_optimization` | experimental | no | future policy plus Growth-gated starter add-on, Python reconciliation health, and human-review requirements | `tests/subscription-usage-import.test.ts`, `tests/subscription-usage-workflow.test.ts`, Python reconciliation tests, future promotion gate |
| `export_reporting_intelligence` | shipped | yes | export preset policy with `exports` and risk/intelligence gates where needed | `test:release-critical:exports`, `test:background-exports`, export privacy/scale tests |
| `ocr_import_intelligence` | shipped | yes | active org, review gates, OCR/internal job controls, Starter paid gates where applicable | intake/review and OCR trust tests |
| `reminder_workflow_automation` | shipped | yes | fixed trusted reminder kernel; `multi_recipient_reminders` for broader recipient behavior | workflow/reminder control-plane tests |
| `billing_entitlement_control` | shipped | yes | canonical billing snapshot and Paddle-first provider policy | billing release-critical/control-plane tests |
| `admin_support_operations` | shipped | yes | internal role, separated internal secrets, destructive auth where needed | ops, monitoring, deletion control-plane tests, `tests/customer-onboarding-support-boundary.test.ts`, `tests/event-taxonomy-onboarding-support.test.ts`, `tests/customer-onboarding-progress.test.ts` |
| `revenue_intelligence_command_center` | shipped | yes | active org plus admin/operator/reviewer role over existing renewal-control evidence | `test:revenue-intelligence`, Revenue Intelligence boundary and audit-taxonomy tests |
| `enterprise_identity_rbac_retention` | deferred | no | future Enterprise policy | `tests/enterprise-identity-runtime.test.ts`; `tests/enterprise-identity-schema-routes.test.ts`; `tests/data-governance-boundary.test.ts`; future enterprise release gate required before activation |
| `enterprise_integrations` | deferred | no | future Enterprise integration policy | `tests/platform-api-boundary.test.ts`; `tests/platform-api-schema-routes.test.ts`; future integration release gate required before activation |
| `advanced_retention_governance_analytics` | experimental | no | future Portfolio/Enterprise analytics policy | future analytics release gate required before activation |
| `full_clm_expansion` | excluded | no | excluded from product direction | current-scope and shipped-first tests must keep it out |

## Promotion Rules

A module may move from deferred or experimental to shipped only when all of these are true:

- The registry status changes in `lib/product/platform-modules.ts`.
- The module declares its entitlement source, minimum plan, and owner surfaces.
- The module has at least one concrete test or release gate mapped in `requiredTestsOrReleaseGates`.
- Customer-facing docs are updated to describe the exact shipped scope and what remains disallowed.
- Privacy, audit, export, billing, tenant-isolation, monitoring, and support-readiness boundaries are reviewed where relevant.
- The shipped kernel remains renewal-control focused and does not become full CLM, negotiation, e-signature, generic workflow, or integration theater.
- Enterprise identity changes must also update `lib/product/enterprise-rbac.ts`, `lib/product/enterprise-identity.ts`, `lib/product/enterprise-identity-runtime.ts`, `lib/product/enterprise-identity-schema.ts`, `lib/product/enterprise-identity-routes.ts`, [ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md](ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md), and the implementation/schema/admin docs under [enterprise/](enterprise/).
- Data governance or retention changes must also update `lib/product/data-governance.ts`, [DATA_GOVERNANCE_RETENTION_BOUNDARY.md](DATA_GOVERNANCE_RETENTION_BOUNDARY.md), and [enterprise/DATA_GOVERNANCE_IMPLEMENTATION_PLAN.md](enterprise/DATA_GOVERNANCE_IMPLEMENTATION_PLAN.md).
- Public API or integration changes must also update `lib/product/platform-api.ts`, `lib/product/platform-api-schema.ts`, `lib/product/platform-api-routes.ts`, [API_AND_INTEGRATION_BOUNDARY.md](API_AND_INTEGRATION_BOUNDARY.md), [enterprise/API_INTEGRATION_SCHEMA_AND_ROUTES.md](enterprise/API_INTEGRATION_SCHEMA_AND_ROUTES.md), and [enterprise/API_INTEGRATION_IMPLEMENTATION_PLAN.md](enterprise/API_INTEGRATION_IMPLEMENTATION_PLAN.md).
- Customer onboarding or support/success changes must also update `lib/product/customer-onboarding.ts`, `lib/product/customer-onboarding-progress.ts` when customer-facing progress changes, `lib/product/support-success.ts`, `lib/product/event-taxonomy.ts`, [CUSTOMER_ONBOARDING_BOUNDARY.md](CUSTOMER_ONBOARDING_BOUNDARY.md), [SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md](SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md), [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md), and [enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md](enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md).
- Revenue Intelligence changes must preserve the split between the shipped bounded command center and the future external outreach foundation. The command center may aggregate existing renewal-control evidence; external outreach delivery, CRM enrichment, lead databases, and sending still require the future Revenue Intelligence release gate.

## Drift Rules

- Deferred, experimental, and excluded modules must not appear in customer navigation as shipped product.
- A shipped module without mapped tests or release gates is not release-grade.
- Entitlement-gated modules must declare the commercial feature, export preset policy, internal role policy, or future policy that governs access.
- Docs and registry must agree on status labels: shipped, deferred, experimental, or excluded.
- Existing strategic/reference docs may remain, but they are not evidence that a module is shipped.
