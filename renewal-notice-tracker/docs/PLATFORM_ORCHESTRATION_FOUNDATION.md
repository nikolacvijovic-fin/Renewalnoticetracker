# Platform Orchestration Foundation

Canonical code source: `lib/product/platform-orchestration.ts`.

No end-user functionality is shipped by this layer. It does not add UI, integrations, workflows, public APIs, sending, or provider calls. It is a shared platform contract so future modules can plug into one architecture instead of reinventing organizations, providers, approvals, audit, monitoring, billing, and market policy separately.

## Why This Exists

NoticeControl now has multiple substantial domains:

- Renewal Management
- Contract Intelligence
- Revenue Intelligence foundation
- Market Profiles
- Market Activation Approval
- Enterprise Identity
- Billing and Entitlements
- Provider Registry and provider policies
- AI contracts
- Compliance contracts
- Monitoring
- Audit
- Deployment readiness
- Product modules

The risk is not a missing feature. The risk is subsystem drift: every domain slowly growing its own concepts for organization scope, lifecycle, health, providers, approvals, audit, events, and permissions.

## Duplicated Concepts Inventory

The orchestration registry documents recurring platform concepts and their canonical ownership:

- `organization`: appears in contracts, billing, intelligence, exports, and internal ops. Canonical boundary: active organization context and tenant-scoped query helpers.
- `workspace`: appears in workspace deletion, internal ops, and onboarding. Canonical boundary: organization-scoped workspace lifecycle with audit evidence.
- `product`: appears in platform modules, revenue intelligence, and pricing docs. Canonical boundary: offer/product profiles tied to module status and current product truth.
- `module`: appears in platform modules, market profiles, and scope-freeze docs. Canonical boundary: `lib/product/platform-modules.ts`.
- `capability`: appears in billing features, exports, intelligence, and future API scopes. Canonical boundary: `lib/product/platform-orchestration.ts`.
- `provider`: appears in billing, AI/OCR, email, identity, and monitoring. Canonical boundary: provider policy is capability and market gated.
- `market_profile`: appears in market profiles, market activation, and revenue intelligence. Canonical boundary: `lib/product/market-profiles.ts`.
- `audit`: appears in customer audit logs, identity contracts, exports, and governance. Canonical boundary: audit is customer/accountability truth.
- `monitoring`: appears in exports, reminders, OCR, billing, and identity readiness. Canonical boundary: sanitized operational events and alert severity.
- `billing`: appears in entitlements, routes, pricing, and intelligence access. Canonical boundary: canonical billing snapshot.
- `permission`: appears in roles, intelligence, exports, internal routes, and future API scopes. Canonical boundary: explicit action/capability permission policy.
- `export`: appears in contract exports, background jobs, and future reporting/API. Canonical boundary: preset-based bounded exports.
- `job`: appears in background exports, reminders, and OCR. Canonical boundary: bounded claims, lease/rescue semantics, and safe failure evidence.
- `health`: appears in ops snapshots, monitoring, and deployment readiness. Canonical boundary: platform health states.

## Platform Domain Model

The platform model defines contracts for:

- `PlatformOrganization`
- `PlatformWorkspace`
- `PlatformModule`
- `PlatformCapability`
- `PlatformProvider`
- `PlatformApproval`
- `PlatformPolicy`
- `PlatformLifecycleState`
- `PlatformRuntimeContext`
- `PlatformFeatureGate`
- `PlatformComplianceBoundary`
- `PlatformAuditBoundary`
- `PlatformEvent`
- `PlatformJob`
- `PlatformHealth`

The current implementation intentionally keeps these as typed contracts and registries. Business logic remains in domain modules such as `lib/contracts`, `lib/intelligence`, `lib/billing`, `lib/notifications`, `lib/product/enterprise-identity-runtime.ts`, and `lib/product/revenue-intelligence.ts`.

## Platform Capability Registry

Every platform capability declares:

- id
- lifecycle
- health
- owning platform module
- dependencies
- required providers
- required permissions
- required plans
- required market policies
- required identity policies
- required audit events
- required monitoring
- deployment/release gates
- docs

Current registered capabilities include:

- `renewals`
- `contracts`
- `contract_intelligence`
- `revenue_intelligence`
- `billing`
- `identity`
- `providers`
- `market_profiles`
- `market_activation`
- `analytics`
- `ocr`
- `ai_generation`
- `exports`
- `notifications`
- `approval_queue`
- `audit`
- `monitoring`
- `deployment_readiness`
- `permissions`
- `compliance`

## Dependency Graph

The dependency graph lets the platform answer what a capability requires.

Examples:

- `revenue_intelligence` depends on `market_profiles`, `compliance`, `ai_generation`, `approval_queue`, `audit`, and `monitoring`.
- `contract_intelligence` depends on `contracts`, `ocr`, `ai_generation`, `audit`, `monitoring`, and `billing`.
- `exports` depends on `contracts`, `billing`, `audit`, `monitoring`, and `permissions`.

No circular dependencies are allowed.

## Runtime Context

`PlatformRuntimeContext` is the future shared context shape. It includes:

- organization
- workspace
- market
- identity
- subscription
- provider policies
- feature gates
- approval context
- audit context
- monitoring context

Future modules should consume this context instead of reading many unrelated helpers directly. The current implementation validates context shape and consistency only; it does not replace existing runtime helpers.

## Event Registry

The platform event registry is derived from `lib/product/event-taxonomy.ts`. Capabilities may declare required audit events, but required events must already exist in the product event taxonomy. Future events remain future/deferred until real emitters exist.

Audit, analytics, monitoring, operational, billing, and support events stay distinct. This layer does not merge them.

## Health Model

Allowed platform health states:

- `healthy`
- `warning`
- `degraded`
- `maintenance`
- `future_only`
- `disabled`
- `blocked`

Every capability declares a health state. Future-only capabilities must not masquerade as healthy shipped runtime.

## Lifecycle Model

Allowed lifecycle states:

- `planned`
- `experimental`
- `beta`
- `internal`
- `customer_preview`
- `generally_available`
- `deprecated`
- `disabled`
- `future_only`

This lifecycle is separate from the existing shipped/deferred platform module status. Module status answers product packaging truth; lifecycle answers capability maturity.

## Future Expansion Philosophy

New capabilities should be added by first registering:

- lifecycle and health
- owning module
- dependencies
- providers
- permissions
- plans
- market policy
- identity policy
- audit and monitoring expectations
- release gates
- docs

Only then should route, UI, provider, or workflow implementation begin.

## Domain Relationships

Revenue Intelligence is future-only. It depends on compliance, market profiles, AI contracts, approval queue, audit, and monitoring. It must not become a mass email tool or bypass human approval.

Market Expansion is infrastructure. `global/default` remains the only shipped market. Planned and restricted profiles are not runtime permission.

Enterprise Identity is future-only for provider-backed SSO/SCIM. Runtime policy contracts exist, but live provider verification, persistence, routes, and session revocation remain future work.

Contract/Renewal Intelligence remains anchored to reviewed workflow truth. It must not mutate contract truth, activate reminders, or bypass trust gates.

## Promotion Rule

A capability can move forward only when:

- dependency graph remains acyclic
- lifecycle and health are explicit
- required providers and plans are declared
- required market and identity policies are declared
- required audit events are taxonomy-backed
- monitoring expectations are documented
- docs are updated
- release/scope tests prove the boundary
