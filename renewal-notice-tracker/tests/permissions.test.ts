import { describe, expect, it } from "vitest";
import { canUseShippedRuntimeAction, hasRequiredRole } from "@/lib/auth";
import { SHIPPED_RUNTIME_ACTION_MATRIX, SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";
import { normalizeCustomerRole } from "@/lib/product/shipping-profile";

describe("role checks", () => {
  it("allows matching organization roles", () => {
    expect(hasRequiredRole("owner", ["owner", "admin"])).toBe(true);
    expect(hasRequiredRole("admin", ["owner", "admin"])).toBe(true);
    expect(hasRequiredRole("operator", ["operator", "reviewer", "admin"])).toBe(true);
  });

  it("rejects insufficient organization roles", () => {
    expect(hasRequiredRole("reviewer", ["owner", "admin"])).toBe(false);
  });

  it("normalizes the legacy member role into operator", () => {
    expect(normalizeCustomerRole("member")).toBe("operator");
    expect(normalizeCustomerRole("operator")).toBe("operator");
  });

  it("defines one canonical shipped runtime action matrix", () => {
    expect(SHIPPED_RUNTIME_ACTION_MATRIX.upload_import.customerRoles).toEqual([
      "admin",
      "operator"
    ]);
    expect(SHIPPED_RUNTIME_ACTION_MATRIX.review_p0.customerRoles).toEqual([
      "admin",
      "operator",
      "reviewer"
    ]);
    expect(SHIPPED_RUNTIME_ACTION_MATRIX.record_decision.customerRoles).toEqual([
      "admin",
      "operator",
      "owner"
    ]);
    expect(SHIPPED_RUNTIME_ACTION_MATRIX.internal_rescue_actions.internalRoles).toEqual([
      "internal_support",
      "internal_admin"
    ]);
  });

  it("enforces the owner-vs-reviewer split on trust-sensitive shipped actions", () => {
    expect(canUseShippedRuntimeAction("reviewer", "review_p0")).toBe(true);
    expect(canUseShippedRuntimeAction("reviewer", "record_decision")).toBe(false);
    expect(canUseShippedRuntimeAction("owner", "record_decision")).toBe(true);
    expect(canUseShippedRuntimeAction("owner", "edit_p0")).toBe(false);
  });

  it("keeps the operator lane focused on intake, review, and owner assignment", () => {
    expect(canUseShippedRuntimeAction("operator", "upload_import")).toBe(true);
    expect(canUseShippedRuntimeAction("operator", "review_p0")).toBe(true);
    expect(canUseShippedRuntimeAction("operator", "assign_owner")).toBe(true);
    expect(canUseShippedRuntimeAction("operator", "manage_billing")).toBe(false);
  });

  it("keeps workspace management with admins and billing/deletion authority with the right roles", () => {
    expect(canUseShippedRuntimeAction("admin", "manage_billing")).toBe(true);
    expect(canUseShippedRuntimeAction("admin", "manage_org_settings")).toBe(true);
    expect(canUseShippedRuntimeAction("admin", "request_deletion")).toBe(false);
    expect(canUseShippedRuntimeAction("owner", "request_deletion")).toBe(true);
  });

  it("classifies ICS as baseline while CSV/XLSX stay on the paid export path", () => {
    expect(SHIPPED_EXPORT_CLASSIFICATION.csv.baseline).toBe(false);
    expect(SHIPPED_EXPORT_CLASSIFICATION.xlsx.baseline).toBe(false);
    expect(SHIPPED_EXPORT_CLASSIFICATION.ics.baseline).toBe(true);
    expect(SHIPPED_EXPORT_CLASSIFICATION.csv.commercialFeature).toBe("exports");
    expect(SHIPPED_EXPORT_CLASSIFICATION.ics.commercialFeature).toBeNull();
  });
});
