import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import { createAdminScopedContractFileUrl } from "@/lib/contract-intelligence/repositories/admin-extraction-repository";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await context.params;
  const organization = await requireOrganization();
  await requireScopedContract(id, organization.organizationId);
  const result = await createAdminScopedContractFileUrl({
    organizationId: organization.organizationId,
    contractId: id,
    contractFileId: fileId,
    expiresInSeconds: 60
  });
  if (result.error || !result.data) {
    return NextResponse.json({ error: "Contract evidence file is unavailable." }, { status: 404 });
  }
  const page = request.nextUrl.searchParams.get("page");
  const target = page && /^\d+$/.test(page)
    ? `${result.data.signedUrl}#page=${page}`
    : result.data.signedUrl;
  return NextResponse.redirect(target);
}
