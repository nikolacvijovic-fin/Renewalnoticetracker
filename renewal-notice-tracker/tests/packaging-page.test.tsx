import { describe, expect, it } from "vitest";

describe("PackagingPage", () => {
  it("redirects the old public packaging route back to pricing", async () => {
    const Page = (await import("@/app/(marketing)/packaging/page")).default;
    expect(() => Page()).toThrow("NEXT_REDIRECT");
  });
});
