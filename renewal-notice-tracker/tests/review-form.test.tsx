import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewForm } from "@/components/contracts/review-form";

vi.mock("@/lib/actions/contracts", () => ({
  updateContractReviewAction: vi.fn()
}));

describe("ReviewForm", () => {
  it("renders a calm review surface around the trusted P0 workflow", () => {
    render(
      <ReviewForm
        contractId="contract-1"
        metadata={{
          contract_title: "MSA",
          counterparty_name: "Acme",
          contract_type: "MSA",
          effective_date: "2026-01-01",
          renewal_date: "2026-12-31",
          expiration_date: "2026-12-31",
          auto_renewal: true,
          renewal_term: "12 months",
          notice_period_value: 30,
          notice_period_unit: "days",
          notice_deadline_date: "2026-12-01",
          termination_window: "30 days",
          governing_law: "New York",
          payment_terms: "Net 30",
          extracted_clauses: ["Auto-renewal unless notice is given."],
          field_confidence: {
            notice_deadline_date: 0.9,
            renewal_date: 0.9,
            expiration_date: 0.9,
            termination_window: 0.82,
            auto_renewal: 0.9
          },
          field_source_snippets: {
            notice_deadline_date: "30 days before expiration",
            renewal_date: "renews on December 31, 2026",
            expiration_date: "expires on December 31, 2026",
            termination_window: "30 days",
            auto_renewal: "auto-renews annually"
          },
          reminder_recommendations: ["Review the notice deadline before scheduling reminders."],
          reviewer_notes: null,
          needs_review: true,
          is_ocr_assisted: true,
          has_conflict: true,
          has_derived_date: true
        }}
        members={[]}
      />
    );

    expect(screen.getByText("Review P0 fields")).toBeInTheDocument();
    expect(screen.getByText("Exception Review")).toBeInTheDocument();
    expect(screen.getByText("Conflict detected")).toBeInTheDocument();
    expect(screen.getByText("Derived date detected")).toBeInTheDocument();
    expect(screen.getByText(/Current trust state:/i)).toBeInTheDocument();
    expect(screen.getByText("Evidence: 30 days before expiration")).toBeInTheDocument();
    expect(screen.getByText(/OCR fallback was used/i)).toBeInTheDocument();
    expect(screen.getByText(/Accept unverified risk for this review decision/i)).toBeInTheDocument();
    expect(screen.getByText(/Review the notice deadline/)).toBeInTheDocument();
    expect(screen.getByText(/Exception review reason/i)).toBeInTheDocument();
    expect(screen.getByText(/Review outcome/i)).toBeInTheDocument();
    expect(screen.queryByText(/Decision status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/playbook/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reminder rule/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Slack/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Teams/i)).not.toBeInTheDocument();
  });
});
