# Extraction and Review Testing Strategy

This document captures the trust-sensitive QA strategy for extraction and review in Renewal / Notice Date Tracker.

## Focus

- text extraction success/failure
- field extraction success/failure
- fallback metadata behavior
- low-confidence handling
- needs_review logic
- evidence and source snippet persistence
- review save behavior
- reminder regeneration after review
- status transitions after review
- missing dates and unclear clauses
- manual corrections overriding extraction
- template defaults on extracted records

## Trust Rule

The product must fail safe when confidence is weak. It must never silently convert uncertain extraction into trusted operational automation.

## Release Philosophy

Any bug that creates false confidence, hides uncertainty, or ignores reviewer corrections is release-blocking.
