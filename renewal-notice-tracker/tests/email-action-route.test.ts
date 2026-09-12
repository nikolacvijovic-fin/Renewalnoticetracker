import { beforeEach, describe, expect, it, vi } from "vitest";

const executeReminderEmailAction = vi.fn();
const ReminderEmailActionTokenError = class ReminderEmailActionTokenError extends Error {
  constructor(message: string, public readonly code: "invalid" | "expired" | "wrong_action") {
    super(message);
  }
};
const ReminderEmailActionAccessError = class ReminderEmailActionAccessError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
};

vi.mock("@/lib/email/actions", () => ({
  executeReminderEmailAction,
  ReminderEmailActionTokenError,
  ReminderEmailActionAccessError
}));

describe("email action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects valid signed actions", async () => {
    executeReminderEmailAction.mockResolvedValue({
      status: "acknowledged",
      contractUrl: "http://localhost:3000/dashboard/contracts/contract-1"
    });

    const { GET } = await import("@/app/api/email-actions/[action]/[token]/route");
    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ action: "acknowledge", token: "token-1" })
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/contracts/contract-1"
    );
  });

  it("denies expired tokens", async () => {
    executeReminderEmailAction.mockRejectedValue(
      new ReminderEmailActionTokenError("expired", "expired")
    );

    const { GET } = await import("@/app/api/email-actions/[action]/[token]/route");
    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ action: "acknowledge", token: "token-1" })
    });

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: "Email action could not be completed.",
      code: "ERR_EMAIL_ACTION_EXPIRED",
      requestId: expect.any(String)
    });
  });

  it("denies wrong-action tokens and cross-org access safely", async () => {
    executeReminderEmailAction.mockRejectedValueOnce(
      new ReminderEmailActionTokenError("wrong action", "wrong_action")
    );

    const { GET } = await import("@/app/api/email-actions/[action]/[token]/route");
    const wrongActionResponse = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ action: "acknowledge", token: "token-1" })
    });

    expect(wrongActionResponse.status).toBe(403);
    await expect(wrongActionResponse.json()).resolves.toMatchObject({
      error: "Email action could not be completed.",
      code: "ERR_EMAIL_ACTION_INVALID",
      requestId: expect.any(String)
    });

    executeReminderEmailAction.mockRejectedValueOnce(
      new ReminderEmailActionAccessError("wrong org", 403)
    );

    const wrongOrgResponse = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ action: "decision", token: "token-2" })
    });

    expect(wrongOrgResponse.status).toBe(403);
    await expect(wrongOrgResponse.json()).resolves.toMatchObject({
      error: "Email action could not be completed.",
      code: "ERR_EMAIL_ACTION_ACCESS_DENIED",
      requestId: expect.any(String)
    });
  });
});
