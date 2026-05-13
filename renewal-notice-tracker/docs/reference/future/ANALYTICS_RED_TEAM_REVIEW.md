# Analytics Red-Team Review

## Brutal critique

The analytics strategy is broad and thoughtful, but it still risks becoming analytics theater if the team mistakes definitions for measurement. Reliability and ops are easier to quantify than activation depth, workflow abandonment, and true unit economics. That makes it possible to look disciplined while still missing where value dies, bad-fit customers destroy margin, and churn becomes obvious too late.

## Top 10 analytics weaknesses

- ops metrics are easier to trust than product metrics
- health scores may look more precise than the underlying data deserves
- support burden can still miss hidden founder or engineering effort
- attribution can still break source-to-margin reporting
- contract growth can be mistaken for value growth
- revenue metrics can outrun revenue-quality metrics
- churn can remain invisible between state snapshots
- workflow abandonment can be hidden by shallow activity
- event schemas can look canonical while real properties drift
- dashboard surface area can outrun decision ownership

## What must be added

- source-of-truth map for every KPI
- hidden-support-effort capture
- confidence flags for derived scores
- clearer workflow abandonment signals
- formal alert review process

## What should be removed

- metrics that do not map to a real decision
- raw top-of-funnel counts without activation quality
- duplicate dashboard widgets under different names
- overconfident composite scores before signal quality is mature
- ops metrics presented without retention or margin context

## Revised analytics priorities

1. make activation and workflow-depth measurement trustworthy
2. complete support, onboarding, extraction, and rescue cost capture
3. tighten churn-warning visibility before cancellation intent appears
4. only then expand executive polish and anomaly detection
