import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((location: string) => {
  throw new Error(`REDIRECT:${location}`);
});

const createServerSupabaseClient = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    set: vi.fn()
  })
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

describe("auth server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects password updates when no authenticated recovery user exists", async () => {
    const updateUser = vi.fn();
    createServerSupabaseClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null
        }),
        updateUser
      }
    });

    const { updatePasswordAction } = await import("@/lib/actions/auth");
    const formData = new FormData();
    formData.append("password", "longenoughpassword");

    await expect(updatePasswordAction(formData)).rejects.toThrow(
      "REDIRECT:/auth/update-password?message=Use%20a%20valid%20recovery%20session%20before%20updating%20your%20password."
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password only after server-side authenticated-user validation", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null
        }),
        updateUser
      }
    });

    const { updatePasswordAction } = await import("@/lib/actions/auth");
    const formData = new FormData();
    formData.append("password", "longenoughpassword");

    await expect(updatePasswordAction(formData)).rejects.toThrow("REDIRECT:/dashboard");
    expect(updateUser).toHaveBeenCalledWith({
      password: "longenoughpassword"
    });
  });
});
