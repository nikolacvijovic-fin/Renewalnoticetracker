import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("PricingPage", () => {
  it("shows only Starter, Growth, and Portfolio publicly", async () => {
    const Page = (await import("@/app/(marketing)/pricing/page")).default;
    render(await Page());

    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(screen.queryByText("Free")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View packaging strategy/i })).not.toBeInTheDocument();
  });
});
