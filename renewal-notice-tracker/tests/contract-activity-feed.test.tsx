import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ContractActivityFeed,
  summarizeAuditDetails
} from "@/components/contracts/contract-activity-feed";
import { buildAuditDisplaySummary } from "@/lib/audit-display";

describe("ContractActivityFeed", () => {
  it("renders workflow activity without dumping raw JSON", () => {
    render(
      <ContractActivityFeed
        auditLogs={[
          {
            id: "log-1",
            action: "contract.review_updated",
            entity_type: "contract",
            entity_id: "contract-1",
            actor_user_id: "user-1",
            created_at: "2026-05-01T00:00:00.000Z",
            details: {
              needs_review: false,
              cycle_status: "awaiting_decision",
              reminder_regenerated_count: 5,
              superseded_reminder_count: 2,
              processing_status: "scheduled",
              review_reason: "Clause 4.2 uses a disputed derived date.",
              provider_payload: { secret: "should-not-render" },
              raw_extraction_payload: { clause_text: "Never expose this clause" },
              body_preview: "Private note preview"
            }
          }
        ]}
        actorLabels={{ "user-1": "Alex Reviewer" }}
      />
    );

    expect(screen.getByText("Contract: review updated")).toBeInTheDocument();
    expect(screen.getByText(/Actor: Alex Reviewer/i)).toBeInTheDocument();
    expect(screen.getByText(/Affected object: contract/i)).toBeInTheDocument();
    expect(screen.getByText("Marked review complete")).toBeInTheDocument();
    expect(screen.getByText("Cycle state: awaiting decision")).toBeInTheDocument();
    expect(screen.getByText("Trusted reminders scheduled")).toBeInTheDocument();
    expect(screen.getByText("Superseded 2 prior reminders")).toBeInTheDocument();
    expect(screen.getByText("Exception review reason recorded")).toBeInTheDocument();
    expect(screen.queryByText(/"needs_review"/)).not.toBeInTheDocument();
    expect(screen.queryByText(/should-not-render/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Never expose this clause/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Private note preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/disputed derived date/i)).not.toBeInTheDocument();
  });

  it("summarizes audit details into operator-readable lines", () => {
    expect(
      summarizeAuditDetails({
        renewal_decision_status: "terminate",
        acknowledged_at: "2026-05-01T00:00:00.000Z"
      })
    ).toEqual(["Decision: terminate", "Acknowledgment recorded"]);
  });

  it("allows richer but still safe detail only for internal roles", () => {
    const summary = buildAuditDisplaySummary(
      {
        id: "log-2",
        action: "contracts.import_completed",
        entity_type: "import_job",
        entity_id: "import-1",
        actor_user_id: "user-2",
        created_at: "2026-05-02T00:00:00.000Z",
        details: {
          imported_count: 8,
          row_count: 10,
          file_name: "contracts.csv",
          provider_payload: { token: "blocked" }
        }
      },
      {
        view: "internal",
        internalRole: "internal_support",
        actorLabels: { "user-2": "Morgan Support" }
      }
    );

    expect(summary.actorLabel).toBe("Morgan Support");
    expect(summary.objectLabel).toMatch(/Import job/i);
    expect(summary.detailLines).toContain("File: contracts.csv");
    expect(summary.detailLines).toContain("Imported 8/10 rows");
    expect(summary.detailLines.join(" ")).not.toMatch(/blocked/);
  });

  it("requires an internal role for internal audit detail", () => {
    expect(() =>
      buildAuditDisplaySummary(
        {
          id: "log-3",
          action: "contracts.import_completed",
          entity_type: "import_job",
          entity_id: "import-2",
          actor_user_id: "user-3",
          created_at: "2026-05-03T00:00:00.000Z",
          details: { imported_count: 1, row_count: 1 }
        },
        {
          view: "internal"
        }
      )
    ).toThrow(/internal audit detail requires an internal role/i);
  });

  it("redacts intelligence explainability internals in the customer audit view", () => {
    render(
      <ContractActivityFeed
        auditLogs={[
          {
            id: "log-4",
            action: "intelligence.risk_score_viewed",
            entity_type: "intelligence",
            entity_id: "contract-1",
            actor_user_id: "user-4",
            created_at: "2026-05-04T00:00:00.000Z",
            details: {
              layer: "risk",
              contract_count: 1,
              low_confidence_count: 1,
              risk_bands_viewed: ["critical"],
              calculation_version: "risk_score.v1",
              input_data_version: "trusted_workflow_state.v1",
              trusted_fields_used: ["notice_deadline_date", "contract_value_amount"],
              low_confidence_fields_used: ["review_status"],
              contract_ids: ["contract-1"],
              warnings: [{ code: "review_pending", message: "hidden", severity: "critical" }]
            }
          }
        ]}
        actorLabels={{ "user-4": "Taylor Analyst" }}
      />
    );

    expect(screen.getByText("Intelligence: risk score viewed")).toBeInTheDocument();
    expect(screen.getByText("1 contract in scope")).toBeInTheDocument();
    expect(screen.getByText("1 low-confidence score")).toBeInTheDocument();
    expect(screen.queryByText(/risk_score\.v1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trusted_workflow_state\.v1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/notice_deadline_date/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contract-1/i)).not.toBeInTheDocument();
  });
});
