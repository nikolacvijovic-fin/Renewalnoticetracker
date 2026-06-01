import { handleContractsExport } from "@/lib/contracts/export-route";

export async function GET(request: Request) {
  return handleContractsExport("xlsx", request);
}
