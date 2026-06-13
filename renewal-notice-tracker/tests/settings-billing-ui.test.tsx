import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/settings", () => ({
  saveProfileSettingsAction: vi.fn(),
  setActiveOrganizationAction: vi.fn(),
  requestWorkspaceDeletionAction: vi.fn()
}));

describe("settings billing UI", () => {
  it("shows provider context and management controls for admins", async () => {
    const { SettingsForm } = await import("@/components/forms/settings-form");
    render(
      <SettingsForm
        defaults={{
          full_name: "Test User",
          notification_email: "test@example.com",
          organization_name: "Test Org",
          billing_email: "billing@example.com"
        }}
        billing={{
          plan_tier: "growth",
          subscription_status: "active",
          subscription_current_period_end: "2099-01-01T00:00:00.000Z",
          billing_provider_label: "Paddle",
          billing_provider_name: "paddle",
          checkout_supported: true,
          management_supported: true,
          management_message: "Paddle provides self-serve subscription management.",
          trial_started_at: "2098-12-18T00:00:00.000Z",
          trial_ends_at: "2099-01-01T00:00:00.000Z",
          acquisition_source: "pricing_growth_cta",
          commercial_summary: [
            {
              feature: "exports",
              label: "Exports",
              access: {
                allowed: true,
                feature: "exports",
                reason: "allowed",
                message: "Exports is available."
              }
            }
          ]
        }}
        canManageOrg
        organizationOptions={[{ organizationId: "org_1", name: "Test Org" }]}
        activeOrganizationId="org_1"
      />
    );

    expect(screen.getByText("Provider: Paddle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Starter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Growth" })).toBeInTheDocument();
    expect(screen.getByText("Workflow defaults")).toBeInTheDocument();
    expect(screen.getByText("Exports and workspace control")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export contracts as CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request workspace deletion" })).toBeInTheDocument();
    expect(screen.queryByText("Commercial capability summary")).not.toBeInTheDocument();
  });

  it("shows an honest manual-support message and no fake portal for manual invoice orgs", async () => {
    cleanup();
    const { SettingsForm } = await import("@/components/forms/settings-form");
    render(
      <SettingsForm
        defaults={{
          full_name: "Test User",
          notification_email: "test@example.com",
          organization_name: "Test Org",
          billing_email: "billing@example.com"
        }}
        billing={{
          plan_tier: "starter",
          subscription_status: "active",
          subscription_current_period_end: null,
          billing_provider_label: "Manual invoice / wire transfer exception",
          billing_provider_name: "manual",
          checkout_supported: false,
          management_supported: false,
          management_message:
            "Manual invoice and wire transfer billing are support-led exceptions. Contact support for billing changes.",
          trial_started_at: null,
          trial_ends_at: null,
          acquisition_source: null,
          commercial_summary: [
            {
              feature: "multi_recipient_reminders",
              label: "Multi-recipient reminders",
              access: {
                allowed: false,
                feature: "multi_recipient_reminders",
                reason: "upgrade_required",
                minimumPlan: "growth",
                message: "Multi-recipient reminders requires the growth plan."
              }
            }
          ]
        }}
        canManageOrg
        organizationOptions={[{ organizationId: "org_1", name: "Test Org" }]}
        activeOrganizationId="org_1"
      />
    );

    expect(screen.getByText("Provider: Manual invoice / wire transfer exception")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose Starter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upgrade to Growth" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Manual invoice and wire transfer billing are support-led exceptions. Contact support for billing changes."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Workflow defaults")).toBeInTheDocument();
  });

  it("shows an honest PayPal exception message and no fake billing portal", async () => {
    cleanup();
    const { SettingsForm } = await import("@/components/forms/settings-form");
    render(
      <SettingsForm
        defaults={{
          full_name: "Test User",
          notification_email: "test@example.com",
          organization_name: "Test Org",
          billing_email: "billing@example.com"
        }}
        billing={{
          plan_tier: "growth",
          subscription_status: "active",
          subscription_current_period_end: null,
          billing_provider_label: "PayPal support-led exception",
          billing_provider_name: "paypal",
          checkout_supported: false,
          management_supported: false,
          management_message:
            "PayPal billing is available only as a support-led exception and does not include a self-serve billing portal.",
          trial_started_at: null,
          trial_ends_at: null,
          acquisition_source: null,
          commercial_summary: []
        }}
        canManageOrg
        organizationOptions={[{ organizationId: "org_1", name: "Test Org" }]}
        activeOrganizationId="org_1"
      />
    );

    expect(screen.getByText("Provider: PayPal support-led exception")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose Starter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upgrade to Growth" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "PayPal billing is available only as a support-led exception and does not include a self-serve billing portal."
      )
    ).toBeInTheDocument();
  });
});
