import { describe, expect, it } from "vitest";
import {
  getMissingEmailReleaseInputs,
  getMissingP0BrowserInputs,
  getMissingReleaseMetadata,
  PHASE1_EMAIL_RELEASE_REQUIREMENTS,
  PHASE1_RELEASE_CRITICAL_PATHS,
  PHASE1_RELEASE_QUALITY_GATES
} from "@/scripts/phase1-release-gates.mjs";

describe("phase-1 release gates", () => {
  it("defines only the shipped critical journeys", () => {
    expect(PHASE1_RELEASE_CRITICAL_PATHS).toEqual([
      "sign_up_sign_in_callback_protected_session",
      "upload_one_contract",
      "review_p0",
      "assign_owner",
      "trusted_reminder_scheduling",
      "acknowledgment",
      "decision",
      "cycle_action",
      "export",
      "billing_checkout_manage",
      "internal_rescue_visibility"
    ]);
    expect(PHASE1_RELEASE_QUALITY_GATES).toContain("email_delivery_plumbing_presence");
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
      "P0 secondary auth cookie value"
    ]);
    expect(getMissingEmailReleaseInputs({})).toEqual(
      PHASE1_EMAIL_RELEASE_REQUIREMENTS.map(([, label]) => label)
    );
  });
});
