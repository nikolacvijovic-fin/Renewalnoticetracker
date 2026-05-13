import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";

export default async function CounterpartiesPage() {
  await requireOrganization();
  redirect("/dashboard/contracts");
}
