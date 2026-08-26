# Contract-to-Quote Commercial Comparison

## Runtime truth

NoticeControl compares proposal evidence with an immutable version of accepted contract evidence. A proposal never overwrites contract metadata or the reviewed commercial baseline. Material baseline evidence changes create a new version, and material scenario evidence changes require reapproval.

The comparison engine supports recurring and one-time lines, monthly/quarterly/annual/multi-year/partial periods, per-unit and flat pricing, quantities, discounts, commitment totals, and exact currency matching. It returns `insufficient_evidence` for unsupported currency combinations or terms that cannot be annualized safely.

## Evidence labels

- **Extracted fact:** provider output awaiting review.
- **Reviewed fact:** accepted, non-superseded evidence eligible for a baseline.
- **Calculation:** deterministic arithmetic with a recorded calculation version.
- **Estimate:** a bounded opportunity range, never realized savings.
- **Recommendation:** a reviewable negotiation action grounded in findings.
- **Confirmed outcome:** separate customer-confirmed financial evidence outside quote comparison.

## Cost bridge

The deterministic bridge attributes annual change to unit price, quantity, new products, removed products, removed discounts, new fees, and reviewed credits. The bridge is `reconciled` only within one cent of the stated proposal delta. Otherwise the residual remains visible and a critical conflicting-total finding is created.

## Usage trust

Usage can support a quantity opportunity only when it is tied to the same contract and line key through a provider connection and is marked trusted. Stale, partial, sample, unmatched, or conflicting usage is excluded from high-confidence savings calculations.

## Security

Proposal upload, comparison execution, negotiation-position approval, and negotiation-pack export use distinct shipped actions. All persistence carries `organization_id`, RLS is enabled, immutable baseline mutation is rejected, and audit metadata contains identifiers, counts, versions, fingerprints, and warning codes rather than source text or provider payloads.

## No-send boundary

Negotiation briefs are review and export artifacts. NoticeControl does not send vendor communications, change subscriptions, or report an estimate as realized value.

## Deployment

Apply `202608260001_full_document_commercial_intelligence.sql` before `202608260002_contract_quote_negotiation_intelligence.sql`. Regenerate Supabase types after migration deployment and compare them with `lib/supabase/database.types.ts`.
