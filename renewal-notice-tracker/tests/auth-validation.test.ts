import { describe, expect, it } from "vitest";
import {
  authEmailSchema,
  passwordResetSchema,
  updatePasswordSchema
} from "@/lib/validation/auth";

describe("auth validation", () => {
  it("accepts valid auth email payloads", () => {
    expect(authEmailSchema.parse({ email: "ops@example.com" })).toEqual({
      email: "ops@example.com"
    });
    expect(passwordResetSchema.parse({ email: "ops@example.com" })).toEqual({
      email: "ops@example.com"
    });
  });

  it("rejects malformed email payloads", () => {
    expect(() => authEmailSchema.parse({ email: "not-an-email" })).toThrow();
    expect(() => passwordResetSchema.parse({ email: "nope" })).toThrow();
  });

  it("rejects weak password updates", () => {
    expect(() => updatePasswordSchema.parse({ password: "short" })).toThrow();
    expect(updatePasswordSchema.parse({ password: "long-enough-password" })).toEqual({
      password: "long-enough-password"
    });
  });
});
