import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStableSubscriptionUsageFindingIdentity } from "@/lib/subscription-usage/finding-identity";

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

const finding = (overrides: Record<string, unknown> = {}) => ({
  finding_type: "unused_seats" as const,
  reason_code: "purchased_seats_exceed_active_users_30d",
  calculation_version: "subscription_usage_v1",
  source_row_ids: ["row-a"],
  matched_contract_ids: ["00000000-0000-0000-0000-000000000101"],
  utilization: 0.4,
  unused_seats: 6,
  confidence: 0.8,
  warnings: [],
  estimated_savings: 600,
  currency: "USD",
  recommended_action: "reduce_seats" as const,
  involved_providers: ["microsoft_365"],
  involved_products: ["Microsoft 365 E3"],
  evidence: { purchased_seats: 10, active_users_30d: 4, annual_reviewed_cost: 1000, currency: "USD" },
  ...overrides
});

function identity(currentFinding: ReturnType<typeof finding>, scope = "scope-a", batch = "batch-a") {
  return buildStableSubscriptionUsageFindingIdentity({
    organizationId: "org-a",
    finding: currentFinding,
    analysisScopeId: scope,
    snapshotBatchIds: [batch],
    providerSet: ["microsoft_365"],
    scopeFamilyKey: "family-a",
    syncRunId: `sync-${scope}`
  });
}

describe("subscription usage lifecycle stabilization", () => {
  it("keeps finding and material identity stable when only provenance row/scope IDs change", () => {
    const first = identity(finding());
    const rerun = identity(finding({ source_row_ids: ["row-b"] }), "scope-b", "batch-b");
    expect(rerun.logicalOpportunityKey).toBe(first.logicalOpportunityKey);
    expect(rerun.materialEvidenceHash).toBe(first.materialEvidenceHash);
    expect(rerun.findingFingerprint).toBe(first.findingFingerprint);
    expect(rerun.provenanceHash).not.toBe(first.provenanceHash);
  });

  it("requires a new material identity when decision evidence changes", () => {
    const first = identity(finding());
    const changed = identity(finding({ estimated_savings: 900, evidence: { purchased_seats: 10, active_users_30d: 1, annual_reviewed_cost: 1000, currency: "USD" } }));
    expect(changed.logicalOpportunityKey).toBe(first.logicalOpportunityKey);
    expect(changed.materialEvidenceHash).not.toBe(first.materialEvidenceHash);
    expect(changed.findingFingerprint).not.toBe(first.findingFingerprint);
  });

  it.each([
    ["purchased seats", { evidence: { purchased_seats: 12, assigned_seats: 9, active_users_30d: 4, annual_reviewed_cost: 1000, currency: "USD" } }],
    ["assigned seats", { evidence: { purchased_seats: 10, assigned_seats: 8, active_users_30d: 4, annual_reviewed_cost: 1000, currency: "USD" } }],
    ["active usage", { evidence: { purchased_seats: 10, assigned_seats: 7, active_users_30d: 3, annual_reviewed_cost: 1000, currency: "USD" } }],
    ["reviewed cost", { evidence: { purchased_seats: 10, assigned_seats: 7, active_users_30d: 4, annual_reviewed_cost: 1500, currency: "USD" } }],
    ["confidence", { confidence: 0.62 }]
  ])("treats changed %s as material decision evidence", (_label, overrides) => {
    const first = identity(finding({ evidence: { purchased_seats: 10, assigned_seats: 7, active_users_30d: 4, annual_reviewed_cost: 1000, currency: "USD" } }));
    const changed = identity(finding(overrides));
    expect(changed.logicalOpportunityKey).toBe(first.logicalOpportunityKey);
    expect(changed.materialEvidenceHash).not.toBe(first.materialEvidenceHash);
  });

  it("uses material hashes in persistence and preserves review history on material revisions", () => {
    const migration = read("supabase", "migrations", "202608180002_subscription_usage_lifecycle_stabilization.sql");
    const databaseTypes = read("lib", "supabase", "database.types.ts");
    expect(migration).toContain("v_previous.material_evidence_hash = v_material_hash");
    expect(migration).toContain("'material_evidence_changed'");
    expect(migration).toContain("v_previous.review_status");
    expect(migration).toContain("requires_new_review");
    expect(databaseTypes).toContain("material_evidence_hash: string | null");
    expect(databaseTypes).toContain("begin_manual_subscription_usage_sync_attempt");
    expect(databaseTypes).toContain("disconnect_subscription_usage_provider");
    expect(databaseTypes).toContain("cleanup_subscription_usage_consent_attempts");
  });

  it("disconnects transactionally and resolves only findings tied to the disconnected provider scope", () => {
    const migration = read("supabase", "migrations", "202608180002_subscription_usage_lifecycle_stabilization.sql");
    const action = read("lib", "actions", "subscription-usage-optimization.ts");
    expect(migration).toContain("disconnect_subscription_usage_provider");
    expect(migration).toContain("b.provider_connection_id = p_connection_id");
    expect(migration).toContain("resolution_reason = 'provider_disconnected'");
    expect(action.match(/rpc\("disconnect_subscription_usage_provider"/g)).toHaveLength(2);
  });

  it("models explicit bounded same-day retries rather than reusing a failed attempt", () => {
    const migration = read("supabase", "migrations", "202608180002_subscription_usage_lifecycle_stabilization.sql");
    const page = read("app", "dashboard", "subscription-optimization", "page.tsx");
    expect(migration).toContain("attempt_number between 1 and 3");
    expect(migration).toContain("if not p_retry_failed then");
    expect(migration).toContain("v_attempt := v_existing.attempt_number + 1");
    expect(page).toContain('name="retryFailed" value="true"');
    expect(page).toContain("Retry sync");
  });

  it("creates Microsoft consent attempts only after the explicit connect action", () => {
    const page = read("app", "dashboard", "subscription-optimization", "page.tsx");
    const action = read("lib", "actions", "subscription-usage-optimization.ts");
    expect(page).toContain("startMicrosoft365ConnectionAction");
    expect(page).not.toContain("getMicrosoft365AdminConsentUrlAction()");
    expect(action).toContain("Microsoft 365 is already connected for this organization.");
    expect(action).toContain('rpc("create_subscription_usage_consent_attempt"');
  });

  it("preserves row-specific warning evidence across provider, storage, and reconciliation boundaries", () => {
    const types = read("lib", "subscription-usage", "types.ts");
    const python = read("services", "python-intelligence", "app", "routes", "reconcile_usage.py");
    const migration = read("supabase", "migrations", "202608180002_subscription_usage_lifecycle_stabilization.sql");
    expect(types).toContain("warningCodes: string[]");
    expect(python).toContain("set(row.warning_codes)");
    expect(python).toContain("GLOBAL_BLOCKING_ACTIVITY_WARNINGS");
    expect(migration).toContain("usage_import_rows_apply_evidence");
  });

  it("keeps the real-provider smoke and database integration artifacts discoverable", () => {
    expect(fs.existsSync(path.join(process.cwd(), "supabase", "tests", "subscription_usage_lifecycle_stabilization_test.sql"))).toBe(true);
    const runbook = read("docs", "SUBSCRIPTION_USAGE_PRODUCTION_REPAIR_RUNBOOK.md");
    expect(runbook).toContain("Real-provider verification");
    expect(runbook).toContain("do not prove");
  });
});
