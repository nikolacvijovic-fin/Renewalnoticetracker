import { describe, expect, it } from "vitest";
import { mapUserSafeErrorMessage, sanitizeInternalError } from "@/lib/errors";

describe("error handling helpers", () => {
  it("sanitizes internal error text", () => {
    const error = new Error(
      "Request failed for https://api.example.com with bearer abc123 and api_key=secret"
    );

    expect(sanitizeInternalError(error)).not.toContain("https://api.example.com");
    expect(sanitizeInternalError(error)).not.toContain("abc123");
    expect(sanitizeInternalError(error)).not.toContain("secret");
  });

  it("maps user-safe messages by context", () => {
    expect(mapUserSafeErrorMessage("upload")).toContain("uploaded");
    expect(mapUserSafeErrorMessage("extraction")).toContain("parsed");
    expect(mapUserSafeErrorMessage("notification")).toContain("delivered");
    expect(mapUserSafeErrorMessage("auth")).toContain("Authentication");
  });
});
