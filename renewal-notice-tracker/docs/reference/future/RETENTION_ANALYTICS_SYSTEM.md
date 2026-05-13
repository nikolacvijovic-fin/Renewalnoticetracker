# Retention Analytics System

## Retention Definitions
- Retained account: a paying workspace that keeps using the renewal workflow and maintains or expands trusted contract coverage.
- Active account: a workspace with meaningful workflow actions, not just logins.
- Healthy usage: high review coverage, high owner coverage, active reminders/decisions, and visible obligations.

## Cohort Analysis Design
- Signup cohorts
- Activation cohorts
- Plan and segment cohorts
- Contract-volume band cohorts
- Acquisition-source cohorts

## Leading Churn Indicators
- No contract reviewed after upload
- Low owner coverage
- No live obligations surfaced
- Decision gaps on due-soon contracts
- Contract coverage stagnation
- Billing portal opens from shallow accounts
- Review backlog aging

## Lagging Churn Indicators
- Downgrade
- Cancellation request
- Sustained inactivity
- Falling reviewed coverage
- Loss of reminder usage after prior adoption

## Product Behaviors That Predict Retention
- Reviewed contracts keep rising
- Owner coverage stays high
- Due-soon contracts get decisions
- Reminder workflows stay active
- Contract coverage expands
- Reporting and digest loops become recurring

## Product Behaviors That Predict Churn
- Uploads without review
- Missing owners
- No reminder workflow
- No decisions on due-soon contracts
- Pilot-level coverage never expands
- Support-only return behavior

## Weekly Retention Metrics
- Weekly active workflow accounts
- Reviewed contract coverage trend
- Owner coverage trend
- Live obligations surfaced rate

## Monthly Retention Metrics
- Logo retention
- Gross revenue retention
- Contract coverage expansion rate
- Decision hygiene rate

## Workflow Retention Metrics
- Due-soon decision coverage
- Reminder workflow continuity
- Owner-gap rate
- Workflow revisit rate

## Churn-Risk Scoring Logic
- Weight no reviewed contracts heavily
- Weight low owner coverage heavily
- Weight missing live obligations and decision gaps materially
- Add smaller penalties for stagnating coverage and billing portal activity from shallow accounts

## Intervention Triggers
- At-risk score crosses threshold
- Owner coverage drops below target
- Decision coverage drops below target
- No meaningful workflow action for 14 days
- Billing portal opened by a shallow account
- Import-heavy account fails to embed after migration

## Anti-Churn Reporting Views
- Accounts at risk this week
- Accounts with widening owner gaps
- Accounts with due-soon contracts but missing decisions
- Accounts with stalled contract coverage expansion
- Accounts opening billing portal with weak workflow depth
- Accounts needing import/review rescue
