import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildOrganizationActivationState,
  type ActivationContractInput
} from "@/lib/onboarding/activation-state";
import { buildBetaActivationChecklist } from "@/lib/onboarding/beta-activation-checklist";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-05-25T00:00:00.000Z");

function contract(overrides: Partial<ActivationContractInput> = {}): ActivationContractInput {
  return {
    id: "contract-1",
    owner_user_id: "user-1",
    contract_metadata: {
      contract_title: "Acme SaaS",
      renewal_date: "2026-06-30",
      notice_deadline_date: "2026-06-10",
      expiration_date: "2026-06-30",
      auto_renewal: true,
      needs_review: false,
      has_weak_evidence: false,
      accepted_unverified_risk_requested: false,
      field_confidence: {
        renewal_date: 0.95,
        notice_deadline_date: 0.95,
        auto_renewal: 0.95
      }
    },
    reminders: [],
    renewal_decisions: [],
    contract_trust_exception_approvals: [],
    ...overrides
  };
}

function state(contracts: ActivationContractInput[]) {
  return buildOrganizationActivationState({
    organizationId: "org-1",
    contracts,
    now
  });
}

function checklistItem(checklist: ReturnType<typeof buildBetaActivationChecklist>, id: string) {
  const found = checklist.items.find((item) => item.id === id);
  expect(found, id).toBeDefined();
  return found!;
}

function healthCheck(checklist: ReturnType<typeof buildBetaActivationChecklist>, id: string) {
  const found = checklist.setupChecks.find((item) => item.id === id);
  expect(found, id).toBeDefined();
  return found!;
}

describe("beta activation checklist", () => {
  it("shows a first-run checklist for a new organization without fake completion", () => {
    const checklist = buildBetaActivationChecklist({
      activation: state([])
    });

    expect(checklist.completedCount).toBe(0);
    expect(checklist.firstIncompleteItem?.id).toBe("upload_first_contract");
    expect(checklistItem(checklist, "upload_first_contract")).toMatchObject({
      completed: false,
      status: "available",
      href: "/dashboard/contracts/new"
    });
    expect(checklistItem(checklist, "review_extracted_deadline").status).toBe("blocked");
    expect(healthCheck(checklist, "contract_uploaded").status).toBe("needs_action");
    expect(healthCheck(checklist, "calendar_export_available").status).toBe("blocked");
  });

  it("completes upload, deadline review, and owner assignment from durable contract state", () => {
    const checklist = buildBetaActivationChecklist({
      activation: state([contract()])
    });

    expect(checklistItem(checklist, "upload_first_contract").completed).toBe(true);
    expect(checklistItem(checklist, "review_extracted_deadline").completed).toBe(true);
    expect(checklistItem(checklist, "assign_owner").completed).toBe(true);
    expect(checklistItem(checklist, "enable_internal_reminders")).toMatchObject({
      completed: false,
      status: "available",
      href: "/dashboard/contracts/contract-1#reminders"
    });
    expect(checklistItem(checklist, "download_calendar_event")).toMatchObject({
      completed: false,
      status: "available",
      href: "/dashboard/contracts/contract-1/ics"
    });
    expect(healthCheck(checklist, "trusted_notice_deadline").status).toBe("healthy");
    expect(healthCheck(checklist, "owner_assigned").status).toBe("healthy");
  });

  it("completes reminder and first decision only from active reminder and decision evidence", () => {
    const checklist = buildBetaActivationChecklist({
      activation: state([
        contract({
          reminders: [{ status: "scheduled", remind_at: "2026-06-01T00:00:00.000Z" }],
          renewal_decisions: [{ id: "decision-1", status: "cancel" }]
        })
      ]),
      calendarExportDownloaded: true
    });

    expect(checklist.completedCount).toBe(checklist.totalCount);
    expect(checklist.firstIncompleteItem).toBeNull();
    expect(checklistItem(checklist, "enable_internal_reminders").completed).toBe(true);
    expect(checklistItem(checklist, "download_calendar_event").completed).toBe(true);
    expect(checklistItem(checklist, "record_first_decision").completed).toBe(true);
    expect(checklist.customerSafeSummary).toBe("Your first renewal is under control.");
  });

  it("does not treat weak or impossible extracted deadlines as reviewed activation progress", () => {
    const checklist = buildBetaActivationChecklist({
      activation: state([
        contract({
          contract_metadata: {
            ...(contract().contract_metadata as NonNullable<ActivationContractInput["contract_metadata"]>),
            notice_deadline_date: "2026-02-31",
            needs_review: false,
            field_confidence: {
              renewal_date: 0.95,
              notice_deadline_date: 0.99,
              auto_renewal: 0.95
            }
          }
        })
      ])
    });

    expect(checklistItem(checklist, "review_extracted_deadline")).toMatchObject({
      completed: false,
      status: "available"
    });
    expect(checklistItem(checklist, "download_calendar_event").status).toBe("blocked");
    expect(healthCheck(checklist, "trusted_notice_deadline").status).toBe("needs_action");
  });

  it("keeps onboarding output customer-safe and separate from future product scope", () => {
    const checklist = buildBetaActivationChecklist({
      activation: state([contract()]),
      emailConfigured: false
    });
    const rendered = JSON.stringify(checklist);

    for (const marker of [
      "RAW_CONTRACT_TEXT_MARKER",
      "OCR_OUTPUT_MARKER",
      "PROVIDER_PAYLOAD_MARKER",
      "PRIVATE_NOTE_MARKER",
      "SECRET_MARKER",
      "UPLOADED_DOCUMENT_MARKER"
    ]) {
      expect(rendered).not.toContain(marker);
    }

    expect(rendered).not.toMatch(/vendor email sending/i);
    expect(rendered).not.toMatch(/\bCRM\b/i);
    expect(rendered).not.toMatch(/cold outreach/i);
    expect(rendered).not.toMatch(/AI negotiation/i);
    expect(rendered).not.toMatch(/Slack|Teams/i);
  });

  it("keeps activation queries organization-scoped and payload-free", () => {
    const source = fs.readFileSync(path.join(repoRoot, "lib", "onboarding", "queries.ts"), "utf8");

    expect(source).toContain(".eq(\"organization_id\", organizationId)");
    expect(source).toContain(".limit(50)");
    expect(source).not.toContain("raw_contract_text");
    expect(source).not.toContain("extracted_text");
    expect(source).not.toContain("provider_payload");
    expect(source).not.toContain("storage_path");
  });
});
