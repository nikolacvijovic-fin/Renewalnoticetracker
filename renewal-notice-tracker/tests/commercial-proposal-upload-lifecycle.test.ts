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
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result)
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
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
      data: { id: "file-1", proposal_upload_status: "ready" },
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
