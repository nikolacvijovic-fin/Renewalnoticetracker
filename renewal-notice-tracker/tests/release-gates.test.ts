import { describe, expect, it } from "vitest";
import {
  getMissingEmailReleaseInputs,
  getMissingP0BrowserInputs,
  getMissingReleaseMetadata,
  getMissingTwoWeekAutonomyChecklist,
  PHASE1_AUTONOMY_REQUIRED_CHECKLIST,
  PHASE1_EMAIL_RELEASE_REQUIREMENTS,
  PHASE1_HIDDEN_RESCUE_BLOCKERS,
  PHASE1_RELEASE_CRITICAL_PATHS,
  PHASE1_RELEASE_QUALITY_GATES
} from "@/scripts/phase1-release-gates.mjs";

describe("phase-1 release gates", () => {
  it("defines only the shipped critical journeys", () => {
    expect(PHASE1_RELEASE_CRITICAL_PATHS).toEqual([
      "auth_session_callback_protection",
      "active_organization_selection",
      "upload_import",
      "review_p0",
      "assign_owner",
      "trusted_reminder_activation",
      "acknowledgment",
      "decision",
      "cycle_close_reopen",
      "csv_xlsx_export",
      "ics_export",
      "paddle_checkout_manage",
      "manual_invoice_exception",
      "internal_rescue_authz",
      "cross_tenant_denial"
    ]);
    expect(PHASE1_RELEASE_QUALITY_GATES).toContain("email_delivery_plumbing_presence");
    expect(PHASE1_RELEASE_QUALITY_GATES).toContain("two_week_operator_autonomy");
  });

  it("treats release metadata, P0 browser inputs, and email plumbing as hard gates", () => {
    expect(getMissingReleaseMetadata({})).toEqual([
      "smoke-check owner",
      "rollback owner",
      "target environment"
    ]);
    expect(getMissingP0BrowserInputs({})).toEqual([
      "P0 base URL",
      "P0 auth cookie name",
      "P0 auth cookie value",
      "P0 secondary auth cookie value",
      "P0 seeded review contract path",
      "P0 seeded foreign contract path"
    ]);
    expect(getMissingEmailReleaseInputs({})).toEqual(
      PHASE1_EMAIL_RELEASE_REQUIREMENTS.map(([, label]) => label)
    );
  });

  it("treats the two-week autonomy checklist as a release blocker when missing", () => {
    expect(getMissingTwoWeekAutonomyChecklist("")).toEqual([
      ...PHASE1_AUTONOMY_REQUIRED_CHECKLIST,
      ...PHASE1_HIDDEN_RESCUE_BLOCKERS
    ]);
    expect(
      getMissingTwoWeekAutonomyChecklist(`
        upload/import
        review p0
        assign owner
        see trusted reminders
        acknowledge
        record decision
        close/reopen
        export if needed
        recover from ordinary failure states without founder interpretation
        founder manually fixing import silently
        founder triggering reminders manually
        founder interpreting review states live
        founder editing db/admin data outside audited rescue
      `)
    ).toEqual([]);
  });
});
