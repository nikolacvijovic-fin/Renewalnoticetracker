# Renewal Quote Comparison

Renewal quote comparison is an evidence workflow for comparing a vendor renewal quote against the current contract baseline. It is not a negotiation bot, contract rewrite tool, revenue-intelligence module, or source of trusted contract metadata.

## Lifecycle

1. A reviewer, operator, or admin creates a quote comparison from the contract detail evidence tab.
2. The comparison stores normalized commercial summary fields, not raw quote text.
3. The deterministic Python scaffold compares current terms with proposed renewal terms.
4. Findings are stored as reviewable evidence.
5. Savings opportunities can be created from reviewed commercial findings.
6. Findings and savings opportunities remain separate from contract metadata until a human makes a normal product decision elsewhere.

## Finding Types

- `price_increase`
- `discount_removed`
- `sku_changed`
- `payment_terms_changed`
- `renewal_term_changed`
- `auto_renew_risk`
- `notice_window_risk`
- `usage_mismatch`
- `duplicate_vendor_risk`
- `unfavorable_clause_change`

## Savings Opportunities

Savings opportunities are linked back to quote-comparison evidence. They may include estimated savings, currency, confidence, status, and bounded evidence metadata. They must not include raw quote text, raw contract text, OCR output, provider payloads, storage paths, secrets, tokens, or uploaded document contents.

## Confidence And Citations

The deterministic scaffold can include short snippets as citations, but snippets must be bounded and safe. Confidence expresses evidence quality only; it does not mark the finding as trusted or final.

## Audit Events

Current emitted audit events:

- `renewal_quote_comparison.created`
- `renewal_quote_comparison.completed`
- `renewal_quote_comparison.failed`
- `renewal_quote_finding.reviewed`
- `savings_opportunity.created`
- `savings_opportunity.dismissed`
- `savings_opportunity.realized`

Audit metadata is limited to IDs, risk level, price delta percent, estimated savings, confidence, and safe warning/failure codes.

## Deterministic Scaffold Limits

The current Python service uses deterministic parsing and comparison rules. It can detect obvious amount deltas and term differences, but it does not claim provider-backed AI, legal advice, negotiation strategy, or complete SKU-level reconciliation.

Provider-backed quote intelligence remains future work and must add source evidence, prompt/model/version governance, review gates, and no-raw-payload logging tests before it ships.
