# Reliability Testing Strategy

This document captures the QA strategy for reminders, retries, digests, notifications, and cron reliability in Renewal / Notice Date Tracker.

## Focus

- due reminder processing
- retry scheduling
- duplicate suppression
- resend flows
- rerun reminder flows
- failed notification handling
- digest cron
- digest manual send
- reminder source differences
- escalation reminders
- invalid recipient behavior
- empty-recipient handling
- traceability and audit logging

## Reliability Rule

In this product, a late, duplicated, missing, or unexplained reminder is not a minor bug. It is a trust failure.

## Release Philosophy

Anything that can silently skip reminders, duplicate them, hide failures, or erase operator traceability is release-blocking.
