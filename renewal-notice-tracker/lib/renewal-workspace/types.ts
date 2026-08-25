import type { Json } from "@/lib/supabase/database.types";

export const RENEWAL_DECISION_TYPES = [
  "renew_unchanged",
  "renew_reduced_seats",
  "renegotiate_price_or_terms",
  "consolidate_products",
  "terminate",
  "replace_vendor",
  "defer_pending_evidence",
  "insufficient_information"
] as const;

export const RENEWAL_WORKSPACE_STATUSES = [
  "draft",
  "evidence_required",
  "ready_for_review",
  "awaiting_approval",
  "approved",
  "rejected",
  "returned_for_changes",
  "decision_recorded",
  "outcome_confirmed",
  "archived"
] as const;

export const RENEWAL_SCENARIO_TYPES = [
  "current_renewal",
  "reduced_seat_count",
  "negotiated_discount",
  "shorter_renewal_term",
  "product_consolidation",
  "termination_or_replacement"
] as const;

export const RENEWAL_TASK_STATUSES = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;
export const RENEWAL_TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type RenewalDecisionType = (typeof RENEWAL_DECISION_TYPES)[number];
export type RenewalWorkspaceStatus = (typeof RENEWAL_WORKSPACE_STATUSES)[number];
export type RenewalScenarioType = (typeof RENEWAL_SCENARIO_TYPES)[number];
export type RenewalTaskStatus = (typeof RENEWAL_TASK_STATUSES)[number];
export type RenewalTaskPriority = (typeof RENEWAL_TASK_PRIORITIES)[number];

export type RenewalScenario = {
  id: string;
  organization_id: string;
  contract_id: string;
  decision_id: string;
  scenario_type: RenewalScenarioType;
  name: string;
  current_annual_cost: number | null;
  annual_cost: number;
  change_from_current_cost: number | null;
  estimated_savings: number;
  one_time_transition_cost: number;
  net_first_year_effect: number;
  commitment_years: number;
  multi_year_committed_cost: number;
  currency: string;
  exchange_rate_source: string | null;
  evidence_refs: Json;
  evidence_completeness: number;
  is_preferred: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RenewalWorkspaceTask = {
  id: string;
  organization_id: string;
  contract_id: string;
  decision_id: string;
  owner_user_id: string | null;
  title: string;
  due_at: string | null;
  status: RenewalTaskStatus;
  priority: RenewalTaskPriority;
  dependency_task_id: string | null;
  evidence_requirement: string | null;
  completion_note: string | null;
  reminder_id: string | null;
  created_by_user_id: string | null;
  completed_by_user_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RenewalOutcome = {
  id: string;
  organization_id: string;
  contract_id: string;
  decision_id: string;
  decision_version: number;
  selected_decision_type: RenewalDecisionType;
  original_cost: number | null;
  final_agreed_cost: number | null;
  seats_before: number | null;
  seats_after: number | null;
  contract_term_months: number | null;
  estimated_savings: number | null;
  realized_savings: number | null;
  avoided_cost_increase: number | null;
  currency: string | null;
  decision_date: string;
  renewal_completed_at: string;
  evidence_refs: Json;
  evidence_completeness: number;
  confirmed_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RenewalWorkspaceExtension = {
  scenarios: RenewalScenario[];
  tasks: RenewalWorkspaceTask[];
  outcome: RenewalOutcome | null;
};
