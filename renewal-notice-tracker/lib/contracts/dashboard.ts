import { addDays, startOfDay } from "date-fns";
import type { ContractFilter } from "@/lib/constants";

export type DashboardContractRow = {
  id?: string;
  status: string;
  cycle_status?: string | null;
  status_tag: string | null;
  department?: string | null;
  owner_user_id?: string | null;
  owner_name?: string;
  counterparty_id?: string | null;
  renewal_decision_status?: string | null;
  created_at?: string;
  contract_metadata?: {
    contract_title?: string | null;
    counterparty_name?: string | null;
    renewal_date?: string | null;
    expiration_date: string | null;
    notice_deadline_date: string | null;
    auto_renewal: boolean | null;
    needs_review: boolean;
    field_confidence?: Record<string, number> | number | null;
    has_weak_evidence?: boolean | null;
    accepted_unverified_risk_requested?: boolean | null;
    contract_value_amount?: number | null;
    contract_value_currency?: string | null;
    contract_value_period?: string | null;
    price_change_trigger?: string | null;
    payment_trigger?: string | null;
    financial_data_trust_status?: string | null;
  } | null;
};

export function calculateDashboardMetrics(rows: DashboardContractRow[]) {
  const now = startOfDay(new Date()).toISOString();
  const next30 = addDays(new Date(), 30).toISOString();

  return {
    totalContracts: rows.length,
    needsReview: rows.filter((contract) => contract.contract_metadata?.needs_review).length,
    renewalsDueSoon: rows.filter((contract) => {
      const expiration = contract.contract_metadata?.expiration_date;
      return Boolean(expiration && expiration >= now && expiration <= next30);
    }).length,
    noticeDeadlinesDueSoon: rows.filter((contract) => {
      const notice = contract.contract_metadata?.notice_deadline_date;
      return Boolean(notice && notice >= now && notice <= next30);
    }).length
  };
}

export function filterContractsForDashboard(
  rows: DashboardContractRow[],
  filter: ContractFilter
) {
  switch (filter) {
    case "active":
      return rows.filter((row) => row.status !== "archived" && row.status_tag !== "terminated");
    case "needs_review":
      return rows.filter((row) => row.contract_metadata?.needs_review);
    case "auto_renewal":
      return rows.filter((row) => row.contract_metadata?.auto_renewal);
    case "expiring_soon": {
      const next30 = addDays(new Date(), 30).toISOString();
      return rows.filter((row) => {
        const expiration = row.contract_metadata?.expiration_date;
        return Boolean(expiration && expiration <= next30);
      });
    }
    default:
      return rows;
  }
}
