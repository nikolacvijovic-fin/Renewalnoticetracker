# Data Governance Retention Boundary

Canonical code sources: [../lib/product/data-governance.ts](../lib/product/data-governance.ts) and [../lib/product/data-governance-runtime.ts](../lib/product/data-governance-runtime.ts).

NoticeControl does not currently ship customer-facing retention settings, legal hold, configurable deletion windows, data residency selection, broad customer data export, or support-access review portals.

The current product does include narrow operational governance controls:

- owner-requested workspace deletion with internal destructive execution controls
- failed/completed deletion state evidence
- background export artifact expiry metadata
- export artifact size and privacy limits
- backup readiness and restore drill evidence through internal routes
- audit/log/monitoring redaction rules for sensitive data
- internal support diagnostics that should stay code-first and free of raw customer content

Everything broader is future Enterprise governance scope until promoted through the platform module registry and this boundary.

## Governed Data Classes

The registry defines these object classes:

- `uploaded_contract_file`
- `contract_metadata`
- `extracted_ocr_text`
- `generated_intelligence`
- `contract_notes`
- `export_artifact`
- `audit_event`
- `analytics_event`
- `reminder_notification`
- `billing_record`
- `internal_support_log`
- `backup_snapshot`

Each class must declare sensitivity, default retention posture, deletion behavior, exportability, legal-hold applicability, support-access rules, and whether raw content may appear in logs or alerts.

## Current Behavior

Workspace deletion exists today as an owner-requested workflow with internal destructive execution. It must fail closed, record failed state evidence when possible, and never mark a deletion request completed after partial destructive failure.

Background export artifacts exist today as bounded artifacts with expiry metadata. Storage paths must not appear in customer UI, audit details, logs, monitoring, or support diagnostics.

Backup readiness and restore drill evidence exists today as internal operational evidence. Evidence may include status, timestamps, safe summaries, and recovery metrics. It must not include backup contents, storage paths, secrets, or raw customer data.

The runtime governance bridge in `lib/product/data-governance-runtime.ts` currently enforces safe state shaping for deletion/export/support-access operations:

- Retention policy changes require admin or owner authority, Enterprise plan, active/trialing subscription state, and explicit governance enablement. No customer-facing retention settings are shipped yet.
- Export and deletion lifecycle states are normalized as `requested`, `queued`, `processing`, `completed`, `failed`, `cancelled`, or `expired` so completed states cannot silently look like failed or queued states.
- Expired export artifacts are never considered downloadable, even if stale evidence still contains a download flag.
- Support diagnostics require a purpose code and governed object class before any safe diagnostic metadata can be produced.
- Governance audit inputs are built from allow-listed metadata only.

## Deferred Enterprise Behavior

Future Enterprise governance may add:

- configurable contract document retention
- OCR/extracted text minimization
- audit log retention policies
- notification/reminder log retention policies
- billing record retention documentation
- scheduled deletion windows
- legal hold activation and release
- data residency
- customer data export packages
- support access review evidence

These are not current runtime features and must not appear in customer settings, pricing, navigation, or sales copy as shipped behavior.

## Legal Hold Assumptions

Legal hold is future-only. A future legal hold must:

- be explicitly scoped to organization, object classes, and reason code
- block applicable deletion and expiry actions
- be auditable without raw content
- have release semantics
- be visible to authorized Enterprise admins only after the permission model exists

No legal-hold claim should be made until runtime enforcement exists.

## Audit And Metadata Safety

Governance audit/log/monitoring metadata must never include:

- raw contract text
- OCR output
- full notes
- storage paths
- provider payloads
- tokens
- secrets
- backup contents

Safe metadata includes organization IDs, actor IDs, request IDs, object classes, policy IDs, status, failure codes, timestamps, counts, and retention window labels.

## Promotion Criteria

Before live retention/legal hold/data governance controls ship:

- `lib/product/data-governance.ts` status changes must be intentional and tested.
- `enterprise_identity_rbac_retention` in the platform module registry must remain aligned.
- Data classes must have implemented deletion, export, audit, support-access, and legal-hold behavior.
- Customer-facing claims must match implemented behavior.
- Backup/restore and workspace deletion runbooks must be current.
- Tests must prove tenant isolation, redaction, legal-hold blocking if enabled, artifact expiry, and failure evidence.
