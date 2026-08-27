import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/config", () => ({
  getAppConfig: () => ({ supabase: { storageBucket: "contracts" } })
}));

function selectQuery(result: { data: unknown; error: Error | null }) {
  const query = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result)
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function updateQuery(result: { data: unknown; error: Error | null }) {
  const query = {
    update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result)
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

describe("commercial proposal upload lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the uploaded storage object when the database row cannot be created", async () => {
    const scoped = selectQuery({ data: { id: "contract-1" }, error: null });
    const existing = selectQuery({ data: null, error: null });
    const raced = selectQuery({ data: null, error: null });
    const rowError = new Error("database_insert_failed");
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: rowError }) })
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    let contractFilesCall = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "contracts") return scoped;
        contractFilesCall += 1;
        if (contractFilesCall === 1) return existing;
        if (contractFilesCall === 2) return { insert };
        return raced;
      }),
      storage: { from: vi.fn(() => ({ upload, remove })) }
    };
    createAdminSupabaseClient.mockReturnValue(client);
    const { uploadAdminRenewalProposalFile } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    const result = await uploadAdminRenewalProposalFile({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("proposal")
    });

    expect(result).toEqual({ data: null, error: rowError });
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^org-1\/contract-1\/commercial-proposals\/.+\.pdf$/)]);
  });

  it("defines pending, ready, and failed states with active-fingerprint deduplication", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/202608270002_commercial_proposal_upload_lifecycle.sql"),
      "utf8"
    );
    expect(migration).toContain("proposal_upload_status in ('pending', 'ready', 'failed')");
    expect(migration).toContain("proposal_content_hash");
    expect(migration).toContain("contract_files_active_commercial_proposal_hash_idx");
    expect(migration).toContain("proposal_upload_status in ('pending', 'ready')");
    expect(migration).toContain("provider payloads and extracted customer content are forbidden");
  });

  it("reports success only when one pending, non-deleted upload becomes ready", async () => {
    const scoped = selectQuery({ data: { id: "contract-1" }, error: null });
    const transition = updateQuery({
      data: { id: "file-1", proposal_upload_status: "ready" },
      error: null
    });
    const client = { from: vi.fn((table: string) => table === "contracts" ? scoped : transition) };
    createAdminSupabaseClient.mockReturnValue(client);
    const { markAdminRenewalProposalUploadReady } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    const result = await markAdminRenewalProposalUploadReady({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "file-1"
    });

    expect(result).toEqual({
      data: { id: "file-1", proposal_upload_status: "ready", idempotentReplay: false },
      error: null
    });
    expect(transition.eq).toHaveBeenCalledWith("proposal_upload_status", "pending");
    expect(transition.is).toHaveBeenCalledWith("storage_deleted_at", null);
  });

  it("rejects a failed upload instead of reporting a zero-row transition as success", async () => {
    const scoped = selectQuery({ data: { id: "contract-1" }, error: null });
    const transition = updateQuery({ data: null, error: null });
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => table === "contracts" ? scoped : transition)
    });
    const { markAdminRenewalProposalUploadReady } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    const result = await markAdminRenewalProposalUploadReady({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "failed-file"
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Proposal upload state transition was not allowed.");
  });

  it("cannot report an arbitrary zero-row ready update as successful", async () => {
    const scoped = selectQuery({ data: { id: "contract-1" }, error: null });
    const transition = updateQuery({ data: null, error: null });
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => table === "contracts" ? scoped : transition)
    });
    const { markAdminRenewalProposalUploadReady } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    await expect(markAdminRenewalProposalUploadReady({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "missing-file"
    })).resolves.toMatchObject({ data: null, error: expect.any(Error) });
  });

  it("treats a concurrent pending-to-ready winner as an idempotent success", async () => {
    const scoped = selectQuery({ data: { id: "contract-1" }, error: null });
    const transition = updateQuery({ data: null, error: null });
    const alreadyReady = selectQuery({
      data: { id: "file-1", proposal_upload_status: "ready" },
      error: null
    });
    let contractFilesCall = 0;
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "contracts") return scoped;
        contractFilesCall += 1;
        return contractFilesCall === 1 ? transition : alreadyReady;
      })
    });
    const { markAdminRenewalProposalUploadReady } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    await expect(markAdminRenewalProposalUploadReady({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "file-1"
    })).resolves.toEqual({
      data: { id: "file-1", proposal_upload_status: "ready", idempotentReplay: true },
      error: null
    });
    expect(alreadyReady.eq).toHaveBeenCalledWith("proposal_upload_status", "ready");
    expect(alreadyReady.is).toHaveBeenCalledWith("storage_deleted_at", null);
  });

  it("recovers only a complete organization-scoped pending comparison graph", async () => {
    const scoped = selectQuery({ data: { id: "contract-1" }, error: null });
    const file = selectQuery({
      data: { id: "file-1", proposal_upload_status: "pending", storage_deleted_at: null },
      error: null
    });
    const proposal = selectQuery({
      data: {
        id: "proposal-1",
        comparison_id: "comparison-1",
        quote_file_id: "file-1"
      },
      error: null
    });
    const comparison = selectQuery({
      data: {
        id: "comparison-1",
        proposal_version_id: "proposal-1",
        quote_file_id: "file-1",
        status: "completed"
      },
      error: null
    });
    const proposalLine = selectQuery({ data: { id: "line-1" }, error: null });
    const costBridge = selectQuery({ data: { id: "bridge-1" }, error: null });
    const queriesByTable: Record<string, ReturnType<typeof selectQuery>> = {
      contracts: scoped,
      contract_files: file,
      renewal_quote_proposal_versions: proposal,
      renewal_quote_comparisons: comparison,
      renewal_quote_proposal_line_items: proposalLine,
      renewal_quote_cost_bridges: costBridge
    };
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => queriesByTable[table])
    });
    const { getAdminRecoverablePendingCommercialProposal } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    await expect(getAdminRecoverablePendingCommercialProposal({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "file-1"
    })).resolves.toEqual({
      data: {
        comparisonId: "comparison-1",
        proposalVersionId: "proposal-1",
        proposal_upload_status: "pending"
      },
      error: null
    });
    expect(proposal.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(proposal.eq).toHaveBeenCalledWith("contract_id", "contract-1");
    expect(comparison.eq).toHaveBeenCalledWith("proposal_version_id", "proposal-1");
    expect(costBridge.eq).toHaveBeenCalledWith("comparison_id", "comparison-1");
    expect(costBridge.eq).toHaveBeenCalledWith("proposal_version_id", "proposal-1");
  });

  it.each([
    ["failed upload", { id: "file-1", proposal_upload_status: "failed", storage_deleted_at: null }],
    ["storage-deleted upload", { id: "file-1", proposal_upload_status: "pending", storage_deleted_at: "2026-08-28T00:00:00.000Z" }]
  ])("does not recover a %s", async (_label, fileRow) => {
    const scoped = selectQuery({ data: { id: "contract-1" }, error: null });
    const file = selectQuery({ data: fileRow, error: null });
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => table === "contracts" ? scoped : file)
    });
    const { getAdminRecoverablePendingCommercialProposal } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    await expect(getAdminRecoverablePendingCommercialProposal({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "file-1"
    })).resolves.toEqual({ data: null, error: null });
  });

  it("does not recover an organization or contract mismatch", async () => {
    const scoped = selectQuery({ data: null, error: null });
    const from = vi.fn(() => scoped);
    createAdminSupabaseClient.mockReturnValue({ from });
    const { getAdminRecoverablePendingCommercialProposal } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    await expect(getAdminRecoverablePendingCommercialProposal({
      organizationId: "foreign-org", contractId: "contract-1", quoteFileId: "file-1"
    })).resolves.toEqual({ data: null, error: null });
    expect(from).toHaveBeenCalledTimes(1);
    expect(scoped.eq).toHaveBeenCalledWith("organization_id", "foreign-org");
    expect(scoped.eq).toHaveBeenCalledWith("id", "contract-1");
  });

  it("does not recover a pending graph without its cost bridge", async () => {
    const rows: Record<string, unknown> = {
      contracts: { id: "contract-1" },
      contract_files: { id: "file-1", proposal_upload_status: "pending", storage_deleted_at: null },
      renewal_quote_proposal_versions: { id: "proposal-1", comparison_id: "comparison-1", quote_file_id: "file-1" },
      renewal_quote_comparisons: { id: "comparison-1", proposal_version_id: "proposal-1", quote_file_id: "file-1", status: "completed" },
      renewal_quote_proposal_line_items: { id: "line-1" },
      renewal_quote_cost_bridges: null
    };
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => selectQuery({ data: rows[table], error: null }))
    });
    const { getAdminRecoverablePendingCommercialProposal } = await import(
      "@/lib/quote-comparison/repositories/admin-quote-comparison-repository"
    );

    await expect(getAdminRecoverablePendingCommercialProposal({
      organizationId: "org-1", contractId: "contract-1", quoteFileId: "file-1"
    })).resolves.toEqual({ data: null, error: null });
  });

  it("keeps legacy comparison creation from treating pending or failed commercial uploads as usable", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/actions/contracts/quote-comparison.ts"),
      "utf8"
    );
    expect(source).toContain('quoteFile.extraction_source === "commercial_proposal"');
    expect(source).toContain('quoteFile.proposal_upload_status !== "ready"');
    expect(source).toContain("Commercial proposal evidence is not ready for use.");
  });
});
