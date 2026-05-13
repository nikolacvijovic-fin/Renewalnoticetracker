# Profitability Analytics Design

## Goal

Connect:

- pricing
- packaging
- activation
- retention
- support cost
- margin quality
- expansion potential

This is not generic SaaS reporting. It is an operator system for deciding which customers, channels, and workflows are actually profitable.

## Core Profitability Metrics

- gross margin by segment
- contribution margin per account
- support cost as percent of ACV

## LTV Proxies

- coverage expansion LTV proxy
- workflow depth LTV proxy

## Payback Metrics

- activation-to-paid payback proxy
- CAC recovery by segment

## Support Burden Metrics

- support touches per active account
- time to support resolution for onboarding blockers

## Onboarding Burden Metrics

- onboarding hours per converted account
- messy-import burden rate

## AI Extraction Cost Metrics

- extraction cost per active tracked contract
- extraction cost per paying account

## Notification Cost Metrics

- notification cost per live obligation
- retry-driven notification cost rate

## Gross Margin Warning Metrics

- negative-margin account rate
- high-touch low-ACV account rate

## Segment Profitability Comparisons

- operational SMB vs tiny SMB
- midsize ops-led vs operational SMB
- partner referrals vs broad paid acquisition

## Leading Indicators Of Strong Unit Economics

- embedded workflow rate
- healthy expansion candidate rate
- coverage expansion
- strong owner/reminder/decision discipline

## Dashboards

### Profitability command center

- gross margin by segment
- negative-margin account rate
- support cost as percent of ACV
- CAC recovery by segment
- embedded workflow rate

### Support and onboarding burden

- support touches per active account
- onboarding blocker resolution
- onboarding hours per converted account
- messy-import burden rate
- high-touch low-ACV rate

### AI and reminder cost quality

- extraction cost per active tracked contract
- extraction cost per paying account
- notification cost per live obligation
- retry-driven notification cost rate

### Segment and source economics

- segment contribution comparison
- source quality comparison
- coverage expansion LTV proxy
- healthy expansion candidate rate

## Drilldowns

- by plan tier
- by company size band
- by contract volume band
- by persona
- by acquisition source
- by workflow depth
- by reliability burden

## Warning Thresholds

- gross margin below 75 percent = warning
- gross margin below 65 percent = critical
- support cost above 15 percent of ACV = warning
- support cost above 25 percent of ACV = critical
- payback above 12 months = warning
- payback above 18 months = critical
- high-touch low-ACV accounts growing = escalation

## Required Instrumentation

- support time logs
- onboarding time logs
- extraction usage logs with estimated cost
- notification cost logs with retries
- commercial milestone events with plan and source context
- manual rescue logs

## Blind Spots To Avoid

- measuring MRR without contribution margin
- measuring conversion without activation depth
- measuring expansion without support burden
- measuring gross margin without per-account service and rescue cost
- keeping noisy channels because they look big at the top of funnel
