import { handleCustomerDataExport } from "@/lib/exports/customer-export-route";

export async function GET() {
  return handleCustomerDataExport("pdf");
}
