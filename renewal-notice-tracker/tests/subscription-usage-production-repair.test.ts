import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runClaimedConnectionsWithBoundedConcurrency } from "@/lib/subscription-usage/scheduled-sync";

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

describe("subscription usage production repair", () => {
  it("uses single-use organization-scoped Microsoft consent attempts", () => {
    const migration = read("supabase", "migrations", "202608180001_subscription_usage_production_repair.sql");
    const action = read("lib", "actions", "subscription-usage-optimization.ts");
    expect(migration).toContain("subscription_usage_consent_attempts");
    expect(migration).toContain("actor_user_id = auth.uid()");
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain("expires_at > timezone('utc', now())");
    expect(migration).toContain("nonce_hash text not null unique");
    expect(migration).toContain("revoke all on table public.subscription_usage_consent_attempts from public, anon, authenticated");
    const callback = action.slice(action.indexOf("export async function completeMicrosoft365AdminConsent"), action.indexOf("export async function disconnectMicrosoft365UsageConnectionAction"));
    expect(callback).toContain('rpc("consume_subscription_usage_consent_attempt"');
    expect(callback.indexOf('rpc("consume_subscription_usage_consent_attempt"')).toBeLessThan(callback.indexOf("acquireMicrosoft365ApplicationToken"));
  });

  it("records immutable snapshot scopes and never reconciles historical organization rows implicitly", () => {
    const migration = read("supabase", "migrations", "202608180001_subscription_usage_production_repair.sql");
    const action = read("lib", "actions", "subscription-usage-optimization.ts");
    expect(migration).toContain("subscription_usage_analysis_scopes");
    expect(migration).toContain("snapshot_batch_ids uuid[] not null");
    expect(migration).toContain("and r.provider <> v_current_provider");
    expect(migration).toContain("order by r.provider, r.completed_at desc nulls last, r.id desc");
    expect(migration).toContain("b.organization_id = p_organization_id");
    expect(action).toContain('.in("batch_id", batchIds)');
    expect(action).toContain("subscription_usage_analysis_scope_too_large");
    expect(action).toContain("subscription_usage_contract_candidate_scope_too_large");
    expect(action).not.toContain(".limit(1000)");
  });

  it("persists finding revisions transactionally without dynamic not-in filters", () => {
    const migration = read("supabase", "migrations", "202608180001_subscription_usage_production_repair.sql");
    const action = read("lib", "actions", "subscription-usage-optimization.ts");
    expect(migration).toContain("logical_opportunity_key");
    expect(migration).toContain("evidence_hash");
    expect(migration).toContain("revision_of_id");
    expect(migration).toContain("and o.review_status = 'open'");
    expect(migration).toContain("and o.scope_family_key = v_scope.scope_family_key");
    expect(migration).toContain("subscription_usage_analysis_findings");
    expect(action).toContain('rpc("persist_subscription_usage_analysis_findings"');
    expect(action).not.toContain('.not("finding_fingerprint"');
  });

  it("claims only due connected work atomically and recovers only scheduled stale runs", () => {
    const migration = read("supabase", "migrations", "202608180001_subscription_usage_production_repair.sql");
    const route = read("app", "api", "cron", "subscription-usage-sync", "route.ts");
    expect(migration).toContain("where c.status = 'connected'");
    expect(migration).toContain("c.next_scheduled_sync_at <= timezone('utc', now())");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("metadata->>'source' = 'scheduled_daily'");
    expect(migration).toContain("grant execute on function public.claim_due_subscription_usage_connections(integer, integer, uuid) to service_role");
    expect(route).toContain("requireCronSecretRouteAuth");
  });

  it("isolates worker failures while enforcing bounded concurrency", async () => {
    let active = 0;
    let maximumActive = 0;
    const outcomes = await runClaimedConnectionsWithBoundedConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (value === 2) throw new Error("provider failure");
      return value;
    });
    expect(maximumActive).toBe(2);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(3);
    expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(1);
  });

  it("uses maintained CSV parsing, versioned SKU identity, and GET-only Google requests", () => {
    const microsoft = read("services", "java-enterprise-connectors", "src", "main", "java", "com", "noticecontrol", "enterprise", "connectors", "Microsoft365UsageInventoryConnector.java");
    const google = read("services", "java-enterprise-connectors", "src", "main", "java", "com", "noticecontrol", "enterprise", "connectors", "GoogleWorkspaceUsageInventoryConnector.java");
    const controller = read("services", "java-enterprise-connectors", "src", "main", "java", "com", "noticecontrol", "enterprise", "controllers", "UsageInventoryController.java");
    const environmentTokenProvider = path.join(process.cwd(), "services", "java-enterprise-connectors", "src", "main", "java", "com", "noticecontrol", "enterprise", "connectors", "EnvironmentMicrosoftGraphAccessTokenProvider.java");
    const mapping = JSON.parse(read("services", "java-enterprise-connectors", "src", "main", "resources", "microsoft-sku-mapping.v1.json"));
    expect(microsoft).toContain("org.apache.commons.csv.CSVParser");
    expect(microsoft).toContain("MAX_REPORT_ROWS");
    expect(microsoft).toContain("unmapped_microsoft_sku");
    expect(mapping.version).toBe("microsoft_sku_mapping_v1");
    expect(google).toContain('if (!"GET".equals(method))');
    expect(google).not.toMatch(/\.POST\(|\.PUT\(|\.DELETE\(/);
    expect(controller).not.toContain("EnvironmentMicrosoftGraphAccessTokenProvider");
    expect(fs.existsSync(environmentTokenProvider)).toBe(false);
  });

  it("runs Node, Python, Java, and schema gates from a discoverable pinned root workflow", () => {
    const root = path.resolve(process.cwd(), "..");
    const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "subscription-usage-multi-runtime.yml"), "utf8");
    expect(fs.existsSync(path.join(process.cwd(), ".github", "workflows", "release-readiness.yml"))).toBe(false);
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("working-directory: renewal-notice-tracker/services/python-intelligence");
    expect(workflow).toContain("python -m pytest tests");
    expect(workflow).toContain("mvn --batch-mode test");
    expect(workflow).not.toMatch(/uses:\s+[^\s]+@v\d+/);
  });
});
