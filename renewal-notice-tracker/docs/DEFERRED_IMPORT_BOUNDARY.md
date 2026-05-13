# Deferred Import Boundary

Shipped runtime code must not import deferred or legacy modules.

Allowed deferred storage:

- `deferred/`
- `docs/reference/future/`
- `legacy/`

Shipped runtime scan roots:

- `app/`
- `components/`
- `lib/`

Allowed exceptions:

- [lib/product/deferred-capabilities.ts](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/lib/product/deferred-capabilities.ts:1)
- tests that specifically assert deferred isolation

The shipped runtime fails boundary tests if it imports from:

- `deferred/`
- `docs/reference/`
- `legacy/`

Preserved deferred examples:

- playbook form
- reminder rule form
- retention health panel
- future Slack/Teams surfaces
- future monthly digest
- future advanced analytics
