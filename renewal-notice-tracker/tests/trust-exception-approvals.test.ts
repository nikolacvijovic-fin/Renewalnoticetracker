import { beforeEach, describe, expect, it, vi } from "vitest";

const createAuditLog = vi.fn();

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

type FakeApproval = {
  id: string;
  organization_id: string;
  contract_id: string;
  approved_by_user_id: string;
  approval_type: string;
  approval_reason: string;
  source_field_keys: string[];
  evidence_confidence_at_approval: number;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  revocation_reason: string | null;
  created_at: string;
  updated_at: string;
};

function makeContext(role = "reviewer") {
  return {
    user: { id: "reviewer-1" },
    organizationId: "org-1",
    role
  } as never;
}

function makeApproval(overrides: Partial<FakeApproval> = {}): FakeApproval {
  return {
    id: "approval-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    approved_by_user_id: "reviewer-1",
    approval_type: "manual_without_evidence",
    approval_reason: "Manual review accepted the risk.",
    source_field_keys: ["notice_deadline_date"],
    evidence_confidence_at_approval: 0,
    expires_at: null,
    revoked_at: null,
    revoked_by_user_id: null,
    revocation_reason: null,
    created_at: "2026-05-25T00:00:00.000Z",
    updated_at: "2026-05-25T00:00:00.000Z",
    ...overrides
  };
}

function createFakeClient({
  approvalRows = [],
  contractFound = true,
  insertedApproval = makeApproval({ id: "approval-created" }),
  revokedApproval = makeApproval({
    revoked_at: "2026-05-26T00:00:00.000Z",
    revoked_by_user_id: "reviewer-1",
    revocation_reason: "No longer valid."
  })
}: {
  approvalRows?: FakeApproval[];
  contractFound?: boolean;
  insertedApproval?: FakeApproval;
  revokedApproval?: FakeApproval;
} = {}) {
  const calls: Array<{ table: string; operation: string; payload?: unknown; filters: Array<[string, string]> }> = [];

  function makeBuilder(table: string, operation: string, payload?: unknown) {
    const call = { table, operation, payload, filters: [] as Array<[string, string]> };
    calls.push(call);

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        call.filters.push([column, value]);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      insert(insertPayload: unknown) {
        return makeBuilder(table, "insert", insertPayload);
      },
      update(updatePayload: unknown) {
        return makeBuilder(table, "update", updatePayload);
      },
      async single() {
        if (table === "contracts") {
          return contractFound
            ? { data: { id: "contract-1" }, error: null }
            : { data: null, error: { message: "No rows found" } };
        }

        if (operation === "insert") {
          return { data: insertedApproval, error: null };
        }

        if (operation === "update") {
          return { data: revokedApproval, error: null };
        }

        return { data: approvalRows[0] ?? null, error: null };
      },
      then(resolve: (value: { data: FakeApproval[]; error: null }) => void) {
        resolve({ data: approvalRows, error: null });
      }
    };

    return builder;
  }

  return {
    calls,
    client: {
      from(table: string) {
        return makeBuilder(table, "select");
      }
    }
  };
}

describe("trust exception approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses only active organization-scoped approvals", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const fake = createFakeClient({
      approvalRows: [
        makeApproval({ id: "revoked", revoked_at: "2026-05-24T00:00:00.000Z" }),
        makeApproval({ id: "expired", expires_at: "2026-05-24T00:00:00.000Z" }),
        makeApproval({ id: "active", expires_at: "2026-05-26T00:00:00.000Z" })
      ]
    });
    const { getActiveTrustExceptionApproval } = await import(
      "@/lib/contracts/trust-exception-approvals"
    );

    const approval = await getActiveTrustExceptionApproval(
      { organizationId: "org-1", contractId: "contract-1" },
      { client: fake.client as never, now }
    );

    expect(approval?.id).toBe("active");
    expect(fake.calls[0]).toEqual(
      expect.objectContaining({
        table: "contract_trust_exception_approvals",
        filters: expect.arrayContaining([
          ["organization_id", "org-1"],
          ["contract_id", "contract-1"]
        ])
      })
    );
  });

  it("creates approval records only for review-capable roles and writes safe audit evidence", async () => {
    const fake = createFakeClient();
    const { createTrustExceptionApproval } = await import(
      "@/lib/contracts/trust-exception-approvals"
    );

    const approval = await createTrustExceptionApproval(
      {
        context: makeContext("reviewer"),
        contractId: "contract-1",
        approvalType: "manual_without_evidence",
        approvalReason: "Approved after manual review.",
        sourceFieldKeys: ["notice_deadline_date", "bad/raw/content<>"],
        evidenceConfidenceAtApproval: -1
      },
      { client: fake.client as never }
    );

    expect(approval.id).toBe("approval-created");
    expect(fake.calls.find((call) => call.table === "contracts")?.filters).toEqual(
      expect.arrayContaining([
        ["organization_id", "org-1"],
        ["id", "contract-1"]
      ])
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "trust_exception_approval.created",
        organizationId: "org-1",
        contractId: "contract-1",
        details: expect.objectContaining({
          approvalType: "manual_without_evidence",
          evidenceConfidenceAtApproval: 0,
          sourceFieldKeys: ["notice_deadline_date"]
        })
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain("raw contract text");
  });

  it("requires an approval reason before creating durable approval evidence", async () => {
    const { createTrustExceptionApproval, TrustExceptionApprovalValidationError } = await import(
      "@/lib/contracts/trust-exception-approvals"
    );

    await expect(
      createTrustExceptionApproval({
        context: makeContext("reviewer"),
        contractId: "contract-1",
        approvalType: "low_confidence_evidence",
        approvalReason: "   ",
        evidenceConfidenceAtApproval: 0.3
      })
    ).rejects.toBeInstanceOf(TrustExceptionApprovalValidationError);
  });

  it("prevents duplicate active approvals of the same type for a contract", async () => {
    const fake = createFakeClient({
      approvalRows: [
        makeApproval({
          id: "existing-active",
          approval_type: "low_confidence_evidence",
          evidence_confidence_at_approval: 0.3
        })
      ]
    });
    const { createTrustExceptionApproval, DuplicateActiveTrustExceptionApprovalError } =
      await import("@/lib/contracts/trust-exception-approvals");

    await expect(
      createTrustExceptionApproval(
        {
          context: makeContext("reviewer"),
          contractId: "contract-1",
          approvalType: "low_confidence_evidence",
          approvalReason: "Duplicate should fail.",
          evidenceConfidenceAtApproval: 0.2
        },
        { client: fake.client as never }
      )
    ).rejects.toBeInstanceOf(DuplicateActiveTrustExceptionApprovalError);

    expect(fake.calls.some((call) => call.operation === "insert")).toBe(false);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "trust_exception_approval.denied",
        details: expect.objectContaining({
          reason: "duplicate_active_approval"
        })
      }),
      { mode: "best_effort" }
    );
  });

  it("denies owner approval attempts and audits the denial safely", async () => {
    const { createTrustExceptionApproval, TrustExceptionApprovalAuthorizationError } =
      await import("@/lib/contracts/trust-exception-approvals");

    await expect(
      createTrustExceptionApproval({
        context: makeContext("owner"),
        contractId: "contract-1",
        approvalType: "manual_without_evidence",
        approvalReason: "Owner wants to approve.",
        evidenceConfidenceAtApproval: 0
      })
    ).rejects.toBeInstanceOf(TrustExceptionApprovalAuthorizationError);

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "trust_exception_approval.denied",
        details: expect.objectContaining({
          reason: "role_not_allowed",
          active: false
        })
      }),
      { mode: "best_effort" }
    );
  });

  it("rejects cross-org contract approval before insert", async () => {
    const fake = createFakeClient({ contractFound: false });
    const { createTrustExceptionApproval, TrustExceptionApprovalScopeError } = await import(
      "@/lib/contracts/trust-exception-approvals"
    );

    await expect(
      createTrustExceptionApproval(
        {
          context: makeContext("admin"),
          contractId: "contract-foreign",
          approvalType: "low_confidence_evidence",
          approvalReason: "Should not cross org.",
          evidenceConfidenceAtApproval: 0.2
        },
        { client: fake.client as never }
      )
    ).rejects.toBeInstanceOf(TrustExceptionApprovalScopeError);

    expect(fake.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("revokes approvals with org and contract scope and writes audit evidence", async () => {
    const fake = createFakeClient();
    const { revokeTrustExceptionApproval } = await import(
      "@/lib/contracts/trust-exception-approvals"
    );

    const revoked = await revokeTrustExceptionApproval(
      {
        context: makeContext("operator"),
        approvalId: "approval-1",
        contractId: "contract-1",
        revocationReason: "Evidence was corrected."
      },
      { client: fake.client as never, now: new Date("2026-05-26T00:00:00.000Z") }
    );

    expect(revoked.revoked_at).toBe("2026-05-26T00:00:00.000Z");
    expect(fake.calls.find((call) => call.operation === "update")?.filters).toEqual(
      expect.arrayContaining([
        ["organization_id", "org-1"],
        ["contract_id", "contract-1"],
        ["id", "approval-1"]
      ])
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "trust_exception_approval.revoked",
        details: expect.objectContaining({
          active: false,
          revokedAt: "2026-05-26T00:00:00.000Z"
        })
      })
    );
  });

  it("builds and audits safe gate usage evidence without changing evidence confidence", async () => {
    const approval = makeApproval({
      approval_type: "low_confidence_evidence",
      evidence_confidence_at_approval: 0.35
    }) as never;
    const {
      auditTrustExceptionApprovalUsedForTrustedReminderGate,
      buildTrustExceptionApprovalGateEvidence
    } = await import("@/lib/contracts/trust-exception-approvals");

    const gateEvidence = buildTrustExceptionApprovalGateEvidence(
      approval,
      new Date("2026-05-25T00:00:00.000Z")
    );

    expect(gateEvidence).toEqual(
      expect.objectContaining({
        id: "approval-1",
        approvedByUserId: "reviewer-1",
        approvalReason: "Manual review accepted the risk.",
        evidenceConfidenceAtApproval: 0.35,
        activeAtEvaluation: true
      })
    );

    await auditTrustExceptionApprovalUsedForTrustedReminderGate({
      context: makeContext("reviewer"),
      contractId: "contract-1",
      approval,
      evidenceConfidence: 0.2,
      now: new Date("2026-05-25T00:00:00.000Z")
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "trust_exception_approval.used_for_trusted_reminder_gate",
        entityId: "approval-1",
        details: expect.objectContaining({
          evidenceConfidenceAtApproval: 0.35,
          currentEvidenceConfidence: 0.2,
          activeAtGateEvaluation: true
        })
      }),
      { mode: "best_effort" }
    );
  });
});
