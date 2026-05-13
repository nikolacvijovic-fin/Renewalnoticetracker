## Early RBAC

Customer roles:
- Admin
- Operator
- Reviewer
- Owner

Internal roles:
- Internal Support
- Internal Admin

Rules:
- customer routes never receive internal-only reference or debug payloads
- internal-only routes are enforced at auth, routing, and payload boundaries
- legacy `member` data is normalized to `operator` for early-product behavior
- every shipped-first action is enforced through the canonical matrix in [lib/product/action-matrix.ts](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/lib/product/action-matrix.ts:1)
- trust-sensitive preview routes (`/api/extract`, `/api/reminders`) require authenticated active-org customer access and review-lane permissions
- active organization context is the only shipped runtime org context; customer actions do not fall back to ambiguous membership lookup
- CSV/XLSX exports are paid structured exports, while per-contract ICS export is a shipped baseline export path
- billing is admin/owner only, deletion is owner only, and internal rescue actions are internal-role only
- deferred capabilities are not protected by customer-role checks because they are not active shipped runtime

Shipped action matrix:
- `upload_import`: Admin, Operator
- `review_p0`: Admin, Operator, Reviewer
- `edit_p0`: Admin, Operator, Reviewer
- `assign_owner`: Admin, Operator, Reviewer
- `manage_reminders`: Admin, Operator, Reviewer
- `acknowledge_reminder`: Admin, Operator, Owner
- `record_decision`: Admin, Operator, Owner
- `close_reopen_cycle`: Admin, Operator, Owner
- `export_csv_xlsx`: Admin, Operator, Reviewer, Owner
- `export_ics`: Admin, Operator, Reviewer, Owner
- `manage_billing`: Admin, Owner
- `request_deletion`: Owner
- `internal_rescue_actions`: Internal Support, Internal Admin
