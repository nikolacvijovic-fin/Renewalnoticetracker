import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADD_ON_MANIFESTS,
  canExecuteAddOn,
  getAddOnManifest,
  listAddOns,
  listAddOnsForEntitlements
} from "@/lib/add-ons/add-on-registry";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

function exists(...segments: string[]) {
  return fs.existsSync(path.join(repoRoot, ...segments));
}

describe("add-on architecture registry", () => {
  it("registers commercial add-ons with stable metadata", () => {
    expect(new Set(ADD_ON_MANIFESTS.map((addOn) => addOn.id)).size).toBe(ADD_ON_MANIFESTS.length);

    for (const addOn of ADD_ON_MANIFESTS) {
      expect(addOn.name.trim().length, addOn.id).toBeGreaterThan(0);
      expect(addOn.requiredEntitlement.trim().length, addOn.id).toBeGreaterThan(0);
      expect(addOn.inputContract.trim().length, addOn.id).toBeGreaterThan(0);
      expect(addOn.outputContract.trim().length, addOn.id).toBeGreaterThan(0);
      expect(addOn.documentationHref, addOn.id).toContain("add-on-architecture");
      expect(addOn.commercialValue.trim().length, addOn.id).toBeGreaterThan(0);
    }
  });

  it("lists, filters by entitlement, and blocks unavailable add-ons", () => {
    expect(listAddOns().map((addOn) => addOn.id)).toContain("python_contract_intelligence");
    expect(listAddOns().map((addOn) => addOn.id)).toContain("subscription_usage_optimization");
    expect(getAddOnManifest("go_reliability_worker")?.runtime).toBe("go");

    expect(listAddOnsForEntitlements(["intelligence.contract_extraction"]).map((addOn) => addOn.id)).toEqual([
      "python_contract_intelligence"
    ]);
    expect(listAddOnsForEntitlements(["subscription_usage_optimization"]).map((addOn) => addOn.id)).toEqual([
      "subscription_usage_optimization"
    ]);

    expect(
      canExecuteAddOn({
        addOnId: "python_contract_intelligence",
        entitlements: []
      })
    ).toEqual(expect.objectContaining({ allowed: false, reason: "missing_entitlement" }));

    expect(
      canExecuteAddOn({
        addOnId: "python_contract_intelligence",
        entitlements: ["intelligence.contract_extraction"],
        healthy: false
      })
    ).toEqual(expect.objectContaining({ allowed: false, reason: "not_configured" }));
  });

  it("keeps runtime service scaffolds present but separate from the Next.js UI shell", () => {
    expect(exists("services", "python-intelligence", "app", "main.py")).toBe(true);
    expect(exists("services", "go-worker", "cmd", "worker", "main.go")).toBe(true);
    expect(exists("services", "java-enterprise-connectors", "src", "main", "java", "com", "noticecontrol", "enterprise", "Application.java")).toBe(true);

    const dashboard = readRepoFile("app", "admin", "add-ons", "page.tsx");
    expect(dashboard).toContain("requireInternalRole");
    expect(dashboard).not.toContain("Revenue Intelligence");
    expect(dashboard).not.toContain("cold outreach");
  });

  it("documents the scaffolded versus production-ready boundary", () => {
    const docs = readRepoFile("docs", "add-on-architecture.md");
    for (const addOn of ADD_ON_MANIFESTS) {
      expect(docs, addOn.id).toContain(addOn.id);
    }
    expect(docs).toContain("scaffolded");
    expect(docs).toContain("not production-ready");
    expect(docs).toContain("Do not move UI logic into Python, Go, or Java");
  });

  it("adds tenant-scoped SQL backbone structures with RLS and comments", () => {
    const migration = readRepoFile("supabase", "migrations", "202607130003_add_on_commercial_backbone.sql");
    for (const table of [
      "contract_audit_events",
      "trusted_reminder_gate_events",
      "trust_exception_approval_events",
      "renewal_decision_events",
      "contract_import_batches",
      "usage_import_batches",
      "duplicate_vendor_spend",
      "license_waste_opportunities"
    ]) {
      expect(migration, table).toContain(`public.${table}`);
      expect(migration, table).toContain(`comment on table public.${table}`);
      expect(migration, table).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).toContain("organization_renewal_readiness");
    expect(migration).toContain("spend_at_risk_summary");
    expect(migration).toContain("memberships.organization_id");
    expect(migration).not.toMatch(/members can manage/i);
    expect(migration).not.toMatch(/for all using/i);
  });

  it("adds starter subscription usage optimization schema without raw-file authority", () => {
    const migration = readRepoFile("supabase", "migrations", "202608120001_subscription_usage_optimization_foundation.sql");

    expect(migration).toContain("normalized_product");
    expect(migration).toContain("annual_reviewed_cost");
    expect(migration).toContain("active_users_30d");
    expect(migration).toContain("review_status");
    expect(migration).toContain("usage_import_batches_org_idempotency_idx");
    expect(migration).toContain("No automatic cancellation");
    expect(migration).not.toMatch(/raw file contents in logs/i);
  });

  it("keeps trust exception approvals immutable except formal revocation", () => {
    const migration = readRepoFile("supabase", "migrations", "202607130001_contract_trust_exception_approvals.sql");

    expect(migration).toContain("prevent_contract_trust_exception_approval_mutation");
    expect(migration).toContain("approval fields are immutable after insert");
    expect(migration).toContain("revocation requires revoked_at, revoked_by_user_id, and revocation_reason");
    expect(migration).not.toContain("members can manage contract trust exception approvals");
  });
});
