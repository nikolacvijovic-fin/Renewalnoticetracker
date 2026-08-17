import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMicrosoft365AdminConsentUrl,
  buildMicrosoft365ConnectionRecord,
  mapMicrosoft365SnapshotToImportRows,
  MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS,
  sanitizeMicrosoft365OperationalMetadata,
  verifyMicrosoft365AdminConsentState
} from "@/lib/subscription-usage/microsoft365";

describe("Microsoft 365 subscription usage connector boundary", () => {
  it("builds signed admin-consent URLs and rejects tampered state", () => {
    const state = {
      organizationId: "org-1",
      actorUserId: "user-1",
      nonce: "nonce-1",
      issuedAt: "2026-08-17T00:00:00.000Z"
    };
    const result = buildMicrosoft365AdminConsentUrl({
      config: {
        clientId: "client-1",
        redirectUri: "https://app.example.com/api/subscription-usage/microsoft365/callback",
        signingSecret: "secret-1"
      },
      state
    });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) throw new Error("expected consent url");
    const url = new URL(result.url);
    expect(url.hostname).toBe("login.microsoftonline.com");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(verifyMicrosoft365AdminConsentState(url.searchParams.get("state") ?? "", "secret-1")).toEqual(state);
    expect(verifyMicrosoft365AdminConsentState(`${url.searchParams.get("state")}tampered`, "secret-1")).toBeNull();
  });

  it("stores only managed-secret references for Microsoft 365 connections", () => {
    const record = buildMicrosoft365ConnectionRecord({
      organizationId: "org-1",
      actorUserId: "user-1",
      tenantId: "tenant-1",
      tenantName: "Contoso"
    });

    expect(record.credentialReference).toBe("managed-secret:microsoft365:org-1:tenant-1");
    expect(record.credentialFingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(record.requiredPermissions).toEqual([...MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS]);
    expect(JSON.stringify(record)).not.toMatch(/access_token|refresh_token|authorization_code|Bearer/i);
  });

  it("maps Java connector snapshots into normalized import rows without provider payloads", () => {
    const rows = mapMicrosoft365SnapshotToImportRows({
      accepted: true,
      connector_type: "subscription_usage",
      records: [
        {
          external_product_id: "sku-1",
          vendor: "Microsoft",
          product: "ENTERPRISEPACK",
          category: "productivity",
          purchased_seats: 25,
          assigned_seats: 20,
          active_users_30d: 12,
          active_users_90d: 18,
          last_activity_at: "2026-08-17T00:00:00Z",
          collected_at: "2026-08-17T00:00:00Z",
          source_label: "Microsoft Graph"
        }
      ],
      next_cursor: null,
      warnings: []
    });

    expect(rows).toEqual([
      expect.objectContaining({
        vendor: "Microsoft",
        product: "ENTERPRISEPACK",
        purchased_seats: 25,
        assigned_seats: 20,
        active_users_30d: 12,
        contract_reference: "sku-1"
      })
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/token|payload|user@example/i);
  });

  it("sanitizes Microsoft 365 operational metadata recursively enough for logs and audit", () => {
    const safe = sanitizeMicrosoft365OperationalMetadata({
      organizationId: "org-1",
      connectionId: "conn-1",
      tenantId: "tenant-1",
      status: "failed",
      lastErrorCode: "provider_timeout",
      accessToken: "ACCESS_TOKEN_SHOULD_NOT_SURVIVE",
      providerPayload: { raw: true },
      warningCodes: ["Retry-After token payload"]
    });

    expect(safe).toEqual({
      organizationId: "org-1",
      connectionId: "conn-1",
      tenantId: "tenant-1",
      status: "failed",
      lastErrorCode: "provider_timeout",
      warningCodes: ["[redacted]"]
    });
    expect(JSON.stringify(safe)).not.toMatch(/ACCESS_TOKEN|providerPayload|raw/i);
  });

  it("migration adds org-scoped provider connections, sync runs, and atomic batch RPC", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "202608170001_microsoft365_subscription_usage_connector.sql"),
      "utf8"
    );

    expect(migration).toContain("subscription_usage_provider_connections");
    expect(migration).toContain("subscription_usage_sync_runs");
    expect(migration).toContain("create_subscription_usage_batch_with_rows");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("m.role in ('owner', 'admin', 'operator')");
    expect(migration).toContain("raw Microsoft Graph tokens");
  });
});
