import { requireOrganization } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildCustomerFeedbackReference,
  type CustomerFeedbackReference
} from "@/lib/customer-feedback/customer-feedback";

type CustomerFeedbackStatusRow = {
  id: string;
  feedback_type: string;
  status: string;
  created_at: string;
};

type QueryBuilder = PromiseLike<{
  data: CustomerFeedbackStatusRow[] | null;
  error: { message?: string } | null;
}> & {
  eq: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
};

type UntypedSupabaseClient = {
  from: (table: string) => {
    select: (columns: string) => QueryBuilder;
  };
};

export async function getRecentCustomerFeedbackForCurrentOrganization(input: {
  contractId?: string | null;
  limit?: number;
} = {}): Promise<CustomerFeedbackReference[]> {
  const context = await requireOrganization();
  const supabase = createServerSupabaseClient() as unknown as UntypedSupabaseClient;
  const limit = Math.max(1, Math.min(input.limit ?? 5, 10));
  let query = supabase
    .from("customer_feedback")
    .select("id,feedback_type,status,created_at")
    .eq("organization_id", context.organizationId);

  if (input.contractId) {
    query = query.eq("contract_id", input.contractId);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message ?? "customer_feedback_recent_query_failed");

  return (data ?? []).map((row) =>
    buildCustomerFeedbackReference({
      id: row.id,
      feedbackType: row.feedback_type,
      status: row.status,
      createdAt: row.created_at
    })
  );
}
