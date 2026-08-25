import { handleExecutiveValueReport } from "@/lib/subscription-usage/executive-value-report-route";

export async function GET() {
  return handleExecutiveValueReport("xlsx");
}
