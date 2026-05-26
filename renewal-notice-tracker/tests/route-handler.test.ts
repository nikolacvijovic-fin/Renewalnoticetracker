import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationContextOrNull: vi.fn(),
  getActiveOrganizationContextOrNull: vi.fn(),
  assertCanUseShippedAction: vi.fn(),
  createAuditLog: vi.fn(),
  hasValidInternalRouteSecret: vi.fn((request: Request) => {
    return request.headers.get("x-internal-operations-secret") === "operations-secret";
  }),
  hasValidDestructiveInternalRequestAuth: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  env: {
    CRON_SHARED_SECRET: "cron-secret",
    INTERNAL_OPERATIONS_SECRET: "operations-secret"
  }
}));

vi.mock("@/lib/auth", () => ({
  getOrganizationContextOrNull: mocks.getOrganizationContextOrNull,
  getActiveOrganizationContextOrNull: mocks.getActiveOrganizationContextOrNull,
  assertCanUseShippedAction: mocks.assertCanUseShippedAction,
  ActiveOrganizationRequiredError: class ActiveOrganizationRequiredError extends Error {},
  OrganizationAuthorizationError: class OrganizationAuthorizationError extends Error {}
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: mocks.createAuditLog
}));

vi.mock("@/lib/internal-route-auth", () => ({
  hasValidInternalRouteSecret: mocks.hasValidInternalRouteSecret,
  hasValidDestructiveInternalRequestAuth: mocks.hasValidDestructiveInternalRequestAuth
}));

import {
  ROUTE_REQUEST_ID_HEADER,
  createRouteHandler,
  parseJsonBody,
  requireCronSecretRouteAuth,
  requireInternalRouteAuth,
  requireOrganizationRouteAuth,
  routeValidationError
} from "@/lib/http";

describe("route handler architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasValidInternalRouteSecret.mockImplementation((request: Request) => {
      return request.headers.get("x-internal-operations-secret") === "operations-secret";
    });
  });

  it("formats auth failures consistently and attaches request IDs", async () => {
    mocks.getOrganizationContextOrNull.mockResolvedValueOnce(null);
    const POST = createRouteHandler(
      {
        auth: requireOrganizationRouteAuth()
      },
      async ({ json }) => json({ ok: true })
    );

    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get(ROUTE_REQUEST_ID_HEADER)).toBeTruthy();
    expect(body).toEqual(
      expect.objectContaining({
        error: "Unauthorized",
        code: "ERR_AUTH_REQUIRED_001",
        requestId: expect.any(String)
      })
    );
  });

  it("normalizes validation failures consistently", async () => {
    const POST = createRouteHandler(
      {
        auth: requireCronSecretRouteAuth("cron-secret"),
        parse: async ({ request }) => {
          const body = await parseJsonBody<{ name?: string }>(request, {
            code: "ERR_TEST_REQUEST_001"
          });
          if (!body.name) {
            throw routeValidationError("Name is required.", "ERR_TEST_REQUEST_002");
          }
          return body;
        }
      },
      async ({ json }) => json({ ok: true })
    );

    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "x-cron-secret": "cron-secret",
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Name is required.",
        code: "ERR_TEST_REQUEST_002",
        requestId: expect.any(String)
      })
    );
  });

  it("injects request IDs into audit writes", async () => {
    const POST = createRouteHandler(
      {
        auth: requireCronSecretRouteAuth("cron-secret")
      },
      async ({ audit, json }) => {
        await audit({
          organizationId: "org-1",
          action: "route.audit_tested",
          entityType: "route"
        });
        return json({ ok: true });
      }
    );

    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "x-cron-secret": "cron-secret"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          request_id: expect.any(String)
        })
      }),
      undefined
    );
  });

  it("keeps internal secret enforcement centralized", async () => {
    const POST = createRouteHandler(
      {
        auth: requireInternalRouteAuth("operations")
      },
      async ({ json }) => json({ ok: true })
    );

    const response = await POST(
      new Request("http://localhost/api/test", {
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Unauthorized",
        code: "ERR_INTERNAL_AUTH_REQUIRED_001"
      })
    );
  });

  it("supports webhook-safe raw body handling without JSON parsing", async () => {
    const POST = createRouteHandler(
      {
        parse: async ({ request }) => ({
          raw: await request.text()
        })
      },
      async ({ input, json }) => json({ raw: input.raw })
    );

    const response = await POST(
      new Request("http://localhost/api/webhook", {
        method: "POST",
        body: "raw-body"
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ raw: "raw-body" });
  });
});
