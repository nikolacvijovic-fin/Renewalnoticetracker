import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContractEnterpriseAuditTimeline } from "@/components/contracts/contract-enterprise-audit-timeline";

describe("ContractEnterpriseAuditTimeline", () => {
  it("renders trust and security labels without raw metadata", () => {
    render(
      <ContractEnterpriseAuditTimeline
        events={[
          {
            id: "trust_exception_approval_events:approval-1",
            organizationId: "org-1",
            contractId: "contract-1",
            actorUserId: "admin-1",
            actorLabel: "Admin",
            eventType: "trust_exception_approval.created",
            eventCategory: "trust_exception",
            eventSource: "trust_exception_approval_events",
            severity: "warning",
            summary: "Weak evidence approved",
            metadata: { safe_count: 1 },
            createdAt: "2026-07-01T00:00:00.000Z",
            isSecuritySensitive: false,
            isTrustSensitive: true,
            isExportable: true
          }
        ]}
      />
    );

    expect(screen.getByText("Weak evidence approved")).toBeInTheDocument();
    expect(screen.getByText("Trust-sensitive")).toBeInTheDocument();
    expect(screen.queryByText(/safe_count/i)).not.toBeInTheDocument();
  });
});
