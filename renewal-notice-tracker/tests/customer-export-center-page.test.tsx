import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const getBillingSnapshot = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/billing/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/entitlements")>();
  return {
    ...actual,
    getBillingSnapshot
  };
});

describe("CustomerExportCenterPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    getBillingSnapshot.mockResolvedValue({
      planTier: "starter",
      subscriptionStatus: "active",
      billingProvider: "paddle",
      billingSubscriptionStatus: "active"
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders export options and safe privacy boundary copy for admin users", async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "admin"
    });
    const Page = (await import("@/app/dashboard/exports/page")).default;

    const { container } = render(await Page());

    expect(screen.getByRole("heading", { name: "Export Center" })).toBeInTheDocument();
    expect(screen.getByText("Renewal deadline register")).toBeInTheDocument();
    expect(screen.getByText("Full MVP export bundle")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /JSON/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /PDF/i }).length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain("Raw contract text");
    expect(container.innerHTML).toContain("provider payloads");
  }, 10000);

  it("disables full organization export buttons for non-admin/operator roles", async () => {
    requireOrganization.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    const Page = (await import("@/app/dashboard/exports/page")).default;

    render(await Page());

    expect(screen.getAllByText("Full organization exports require admin or operator access.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /JSON/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /JSON/i }).length).toBeGreaterThan(0);
  });
});
