import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607280001_renewal_quote_comparison.sql"),
  "utf8"
);

describe("renewal quote comparison migration", () => {
  it("creates comparison, finding, and savings evidence tables", () => {
    expect(migration).toContain("create table if not exists public.renewal_quote_comparisons");
    expect(migration).toContain("create table if not exists public.renewal_quote_comparison_findings");
    expect(migration).toContain("create table if not exists public.savings_opportunities");
    expect(migration).toContain("references public.contracts(id)");
    expect(migration).toContain("references public.contract_files(id)");
  });

  it("locks statuses, finding types, and confidence bounds", () => {
    expect(migration).toContain("status in ('draft', 'processing', 'completed', 'failed', 'reviewed', 'archived')");
    expect(migration).toContain("'price_increase'");
    expect(migration).toContain("'discount_removed'");
    expect(migration).toContain("'payment_terms_changed'");
    expect(migration).toContain("confidence >= 0 and confidence <= 1");
    expect(migration).toContain("status in ('open', 'in_review', 'accepted', 'dismissed', 'realized')");
  });

  it("enables organization-scoped RLS with reviewer/operator/admin mutation policies", () => {
    expect(migration).toContain("alter table public.renewal_quote_comparisons enable row level security");
    expect(migration).toContain("Org members can read quote comparisons");
    expect(migration).toContain("Reviewers can create quote comparisons");
    expect(migration).toContain("m.role in ('admin', 'operator', 'reviewer')");
    expect(migration).not.toContain("for delete");
  });
});
