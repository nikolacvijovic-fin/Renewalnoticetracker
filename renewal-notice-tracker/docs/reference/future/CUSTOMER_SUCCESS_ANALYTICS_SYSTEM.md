# Customer Success Analytics System

## Goal

Identify:

- healthy accounts
- weakly activated accounts
- churn-risk accounts
- accounts with reminder or extraction pain
- accounts with high-value expansion potential
- accounts needing onboarding help

This system is tied to the renewal workflow, not generic SaaS activity.

## Account Health Logic

Health score is based on:

- first reviewed contract reached
- owner assignment coverage
- reminder workflow continuity
- due-soon decision discipline
- workflow revisit frequency
- reliability pain load
- contract coverage expansion
- commercial depth signals

Suggested bands:

- 80-100: healthy and embedded
- 60-79: watchlist
- 40-59: at risk
- below 40: failed onboarding or high churn risk

## Activation Health Indicators

- time to first reviewed contract
- first owner assigned
- first reminder created
- first visible live obligation

## Usage Health Indicators

- weekly workflow-active accounts
- needs-review revisit rate
- digest and dashboard revisit pattern
- portfolio coverage momentum

## Workflow Completion Indicators

- owner coverage
- due-soon decision coverage
- reminder maintenance coverage
- playbook and rule adherence

## Reliability Pain Indicators

- failed reminder impact
- extraction failure burden
- manual rescue dependency
- trust backlog

## Commercial Opportunity Indicators

- contract-cap pressure
- coordination complexity
- executive visibility demand
- onboarding-service fit

## CS Dashboards

### Account health triage

- account health score distribution
- accounts by health band
- top negative health-score drivers
- accounts needing onboarding help this week

### Activation and onboarding rescue

- no first reviewed contract after upload
- no first owner assigned
- no first reminder created
- imports completed without workflow activation

### Workflow health and churn risk

- owner coverage by account
- due-soon decision coverage by account
- reminder continuity by account
- needs-review backlog aging
- billing portal opens from shallow accounts

### Reliability pain and trust risk

- accounts with repeated reminder failures
- accounts with repeated extraction failures
- low-confidence review backlog by account
- manual rescue actions by account

### Expansion and commercial opportunity

- accounts near contract caps
- accounts attempting gated collaboration features
- accounts showing coordination complexity
- accounts with executive-reporting demand
- accounts suitable for onboarding or workflow services

## Intervention Playbooks

### Weak activation

Trigger: uploads or imports happen but no reviewed contract appears.

Action:

- send review-focused rescue guidance
- direct user into needs-review queue
- offer scoped onboarding help for good-fit accounts

### Low owner coverage

Trigger: owner coverage remains low after activation.

Action:

- owner-accountability playbook
- admin outreach
- training if org structure is the blocker

### Decision discipline failure

Trigger: due-soon contracts lack renewal decisions.

Action:

- due-soon decision review
- weekly renewal-review ritual
- offer quarterly review for mature accounts

### Reliability pain

Trigger: repeated reminder failures, extraction failures, or manual reruns.

Action:

- investigate first
- communicate clearly if customer impact exists
- monitor workflow trust recovery

### Expansion readiness

Trigger: contract-cap pressure or repeated gated collaboration attempts.

Action:

- position upgrade around broader portfolio coverage
- position Growth around coordination depth
- avoid pushing low-depth accounts into upgrades too early

### Onboarding-service fit

Trigger: messy imports and repeated setup friction.

Action:

- offer fixed-scope import cleanup
- offer reminder/workflow setup package
- do not offer open-ended custom consulting
