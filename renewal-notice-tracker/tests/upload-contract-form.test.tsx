import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadContractForm } from "@/components/contracts/upload-contract-form";

vi.mock("@/lib/actions/contracts", () => ({
  createContractAction: vi.fn(),
  createManualContractAction: vi.fn(),
  importContractsAction: vi.fn()
}));

describe("UploadContractForm", () => {
  it("keeps intake narrow while still surfacing capacity and import rescue", () => {
    render(
      <UploadContractForm
        commercial={{
          contractTrackingAccess: {
            allowed: false,
            currentCount: 5,
            limit: 5,
            remaining: 0,
            message: "You have reached the free plan limit of 5 tracked contracts. Upgrade to starter to add more contracts."
          },
          manualContractsAccess: {
            allowed: false,
            feature: "manual_contracts",
            reason: "upgrade_required",
            minimumPlan: "starter",
            message: "Manual contract creation requires the starter plan."
          },
          multiRecipientAccess: {
            allowed: false,
            feature: "multi_recipient_reminders",
            reason: "upgrade_required",
            minimumPlan: "growth",
            message: "Multi-recipient reminders requires the growth plan."
          },
          capabilitySummary: [
            {
              feature: "manual_contracts",
              label: "Manual contract creation",
              access: {
                allowed: false,
                feature: "manual_contracts",
                reason: "upgrade_required",
                minimumPlan: "starter",
                message: "Manual contract creation requires the starter plan."
              }
            },
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
          ],
          maxReminderRecipients: 1,
          recipientPlaceholder: "ops@example.com"
        }}
        latestImportJob={{
          id: "job-1",
          file_name: "contracts.xlsx",
          status: "completed_with_errors",
          row_count: 8,
          imported_count: 5,
          error_count: 3
        }}
        members={[]}
      />
    );

    expect(screen.getByText("First-value path")).toBeInTheDocument();
    expect(screen.getByText("Shipped workflow focus")).toBeInTheDocument();
    expect(screen.getByText(/fixed-scope import package/i)).toBeInTheDocument();
    expect(screen.getByText("Tracked contract capacity")).toBeInTheDocument();
    expect(screen.getAllByText("Manual contract creation requires the starter plan.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save manual contract" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload and extract" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import contracts" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Download CSV template" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download latest error report" })).toBeInTheDocument();
    expect(screen.getByText(/3 rows still need rescue/i)).toBeInTheDocument();
    expect(screen.getByText(/There are no playbooks, custom reminder rules/)).toBeInTheDocument();
    expect(screen.queryByText("Commercial access for contract intake")).not.toBeInTheDocument();
  });
});
