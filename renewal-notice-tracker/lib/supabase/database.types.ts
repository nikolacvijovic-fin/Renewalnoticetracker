export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: { id: string; actor_user_id: string | null; contract_id: string | null; action: string; details: Json; created_at: string; organization_id: string; entity_type: string; entity_id: string | null };
        Insert: { id?: string; actor_user_id?: string | null; contract_id?: string | null; action: string; details?: Json; created_at?: string; organization_id: string; entity_type?: string; entity_id?: string | null };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      analytics_events: {
        Row: { id: string; organization_id: string | null; actor_user_id: string | null; event_name: string; source_kind: string; source_of_truth: string; event_timestamp: string; idempotency_key: string | null; properties: Json };
        Insert: { id?: string; organization_id?: string | null; actor_user_id?: string | null; event_name: string; source_kind?: string; source_of_truth?: string; event_timestamp?: string; idempotency_key?: string | null; properties?: Json };
        Update: Partial<Database["public"]["Tables"]["analytics_events"]["Insert"]>;
        Relationships: [];
      };
      customer_feedback: {
        Row: { id: string; organization_id: string; contract_id: string | null; entity_type: string | null; entity_id: string | null; submitted_by_user_id: string; feedback_type: string; severity: string; status: string; message: string | null; safe_context: Json; idempotency_key: string; created_at: string; updated_at: string; resolved_at: string | null; resolved_by_user_id: string | null; resolution_note: string | null };
        Insert: { id?: string; organization_id: string; contract_id?: string | null; entity_type?: string | null; entity_id?: string | null; submitted_by_user_id: string; feedback_type: string; severity?: string; status?: string; message?: string | null; safe_context?: Json; idempotency_key: string; created_at?: string; updated_at?: string; resolved_at?: string | null; resolved_by_user_id?: string | null; resolution_note?: string | null };
        Update: Partial<Database["public"]["Tables"]["customer_feedback"]["Insert"]>;
        Relationships: [];
      };
      organization_activation_events: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; event_type: string; contract_id: string | null; metadata: Json; created_at: string };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; event_type: string; contract_id?: string | null; metadata?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["organization_activation_events"]["Insert"]>;
        Relationships: [];
      };
      contract_files: {
        Row: { id: string; contract_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; extracted_text: string | null; extraction_error: string | null; extraction_source: string; ocr_provider: string | null; ocr_status: string | null; ocr_confidence: number | null; ocr_detected_needed: boolean; uploaded_at: string; uploaded_by: string };
        Insert: { id?: string; contract_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; extracted_text?: string | null; extraction_error?: string | null; extraction_source?: string; ocr_provider?: string | null; ocr_status?: string | null; ocr_confidence?: number | null; ocr_detected_needed?: boolean; uploaded_at?: string; uploaded_by: string };
        Update: Partial<Database["public"]["Tables"]["contract_files"]["Insert"]>;
        Relationships: [];
      };
      contract_metadata: {
        Row: { id: string; contract_id: string; contract_title: string | null; counterparty_name: string | null; contract_type: string | null; effective_date: string | null; renewal_date: string | null; expiration_date: string | null; auto_renewal: boolean | null; renewal_term: string | null; notice_period_value: number | null; notice_period_unit: string | null; notice_deadline_date: string | null; termination_window: string | null; governing_law: string | null; payment_terms: string | null; contract_value_amount: number | null; contract_value_currency: string | null; contract_value_period: string | null; price_change_trigger: string | null; payment_trigger: string | null; financial_data_trust_status: string | null; extracted_clauses: Json; field_confidence: Json; field_source_snippets: Json; reminder_recommendations: Json; needs_review: boolean; reviewer_notes: string | null; review_mode: string | null; review_reason: string | null; has_conflict: boolean; has_derived_date: boolean; has_weak_evidence: boolean; is_ocr_assisted: boolean; is_manual_without_evidence: boolean; changes_previously_verified_p0: boolean; accepted_unverified_risk_requested: boolean; reviewed_at: string | null; reviewed_by: string | null; created_at: string; updated_at: string; contract_template_key: string | null };
        Insert: { id?: string; contract_id: string; contract_title?: string | null; counterparty_name?: string | null; contract_type?: string | null; effective_date?: string | null; renewal_date?: string | null; expiration_date?: string | null; auto_renewal?: boolean | null; renewal_term?: string | null; notice_period_value?: number | null; notice_period_unit?: string | null; notice_deadline_date?: string | null; termination_window?: string | null; governing_law?: string | null; payment_terms?: string | null; contract_value_amount?: number | null; contract_value_currency?: string | null; contract_value_period?: string | null; price_change_trigger?: string | null; payment_trigger?: string | null; financial_data_trust_status?: string | null; extracted_clauses?: Json; field_confidence?: Json; field_source_snippets?: Json; reminder_recommendations?: Json; needs_review?: boolean; reviewer_notes?: string | null; review_mode?: string | null; review_reason?: string | null; has_conflict?: boolean; has_derived_date?: boolean; has_weak_evidence?: boolean; is_ocr_assisted?: boolean; is_manual_without_evidence?: boolean; changes_previously_verified_p0?: boolean; accepted_unverified_risk_requested?: boolean; reviewed_at?: string | null; reviewed_by?: string | null; created_at?: string; updated_at?: string; contract_template_key?: string | null };
        Update: Partial<Database["public"]["Tables"]["contract_metadata"]["Insert"]>;
        Relationships: [];
      };
      extracted_field_evidence: {
        Row: { id: string; contract_metadata_id: string; field_name: string; snippet: string; confidence: number | null; source: string; created_at: string };
        Insert: { id?: string; contract_metadata_id: string; field_name: string; snippet: string; confidence?: number | null; source?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["extracted_field_evidence"]["Insert"]>;
        Relationships: [];
      };
      contracts: {
        Row: { id: string; organization_id: string; created_by: string; status: string; source_type: string; is_sample: boolean; latest_file_id: string | null; created_at: string; updated_at: string; owner_user_id: string | null; department: string | null; status_tag: string; counterparty_id: string | null; renewal_decision_status: string; renewal_decision_date: string | null; cycle_status: string; last_acknowledged_at: string | null; last_acknowledged_by: string | null };
        Insert: { id?: string; organization_id: string; created_by: string; status?: string; source_type?: string; is_sample?: boolean; latest_file_id?: string | null; created_at?: string; updated_at?: string; owner_user_id?: string | null; department?: string | null; status_tag?: string; counterparty_id?: string | null; renewal_decision_status?: string; renewal_decision_date?: string | null; cycle_status?: string; last_acknowledged_at?: string | null; last_acknowledged_by?: string | null };
        Update: Partial<Database["public"]["Tables"]["contracts"]["Insert"]>;
        Relationships: [];
      };
      contract_templates: {
        Row: { id: string; organization_id: string; template_key: string; name: string; contract_type: string | null; default_notice_period_value: number | null; default_notice_period_unit: string | null; default_reminder_offsets: Json; checklist: Json; created_at: string };
        Insert: { id?: string; organization_id: string; template_key: string; name: string; contract_type?: string | null; default_notice_period_value?: number | null; default_notice_period_unit?: string | null; default_reminder_offsets?: Json; checklist?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["contract_templates"]["Insert"]>;
        Relationships: [];
      };
      contract_trust_exception_approvals: {
        Row: { id: string; organization_id: string; contract_id: string; approved_by_user_id: string; approval_type: string; approval_reason: string; source_field_keys: string[]; evidence_confidence_at_approval: number; expires_at: string | null; revoked_at: string | null; revoked_by_user_id: string | null; revocation_reason: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; approved_by_user_id: string; approval_type: string; approval_reason: string; source_field_keys?: string[]; evidence_confidence_at_approval: number; expires_at?: string | null; revoked_at?: string | null; revoked_by_user_id?: string | null; revocation_reason?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["contract_trust_exception_approvals"]["Insert"]>;
        Relationships: [];
      };
      counterparties: {
        Row: { id: string; organization_id: string; name: string; raw_counterparty_name: string; normalized_counterparty_name: string; merged_into_counterparty_id: string | null; legal_name: string | null; contact_email: string | null; contact_name: string | null; website: string | null; notes: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; name: string; raw_counterparty_name: string; normalized_counterparty_name: string; merged_into_counterparty_id?: string | null; legal_name?: string | null; contact_email?: string | null; contact_name?: string | null; website?: string | null; notes?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["counterparties"]["Insert"]>;
        Relationships: [];
      };
      counterparty_aliases: {
        Row: { id: string; organization_id: string; counterparty_id: string; alias_name: string; normalized_alias_name: string; created_at: string };
        Insert: { id?: string; organization_id: string; counterparty_id: string; alias_name: string; normalized_alias_name: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["counterparty_aliases"]["Insert"]>;
        Relationships: [];
      };
      exports: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; export_type: string; created_at: string };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; export_type: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["exports"]["Insert"]>;
        Relationships: [];
      };
      import_jobs: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; file_name: string; row_count: number; imported_count: number; status: string; error_message: string | null; error_report_json: Json | null; created_at: string };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; file_name: string; row_count?: number; imported_count?: number; status: string; error_message?: string | null; error_report_json?: Json | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["import_jobs"]["Insert"]>;
        Relationships: [];
      };
      billing_webhook_events: {
        Row: { id: string; provider: string; event_key: string; organization_id: string | null; event_type: string; payload_hash: string; received_at: string; processed_at: string | null; status: string; error_message: string | null };
        Insert: { id?: string; provider: string; event_key: string; organization_id?: string | null; event_type: string; payload_hash: string; received_at?: string; processed_at?: string | null; status?: string; error_message?: string | null };
        Update: Partial<Database["public"]["Tables"]["billing_webhook_events"]["Insert"]>;
        Relationships: [];
      };
      readiness_snapshots: {
        Row: { id: string; organization_id: string | null; calculated_at: string; overall_score: number; confidence_score: number; authz_tenant_score: number; testing_release_score: number; reliability_score: number; billing_score: number; admin_internal_score: number; privacy_compliance_score: number; observability_incident_score: number; analytics_quality_score: number; blockers_count: number; critical_blockers_count: number; snapshot_version: string; details_json: Json };
        Insert: { id?: string; organization_id?: string | null; calculated_at?: string; overall_score: number; confidence_score: number; authz_tenant_score: number; testing_release_score: number; reliability_score: number; billing_score: number; admin_internal_score: number; privacy_compliance_score: number; observability_incident_score: number; analytics_quality_score: number; blockers_count?: number; critical_blockers_count?: number; snapshot_version: string; details_json?: Json };
        Update: Partial<Database["public"]["Tables"]["readiness_snapshots"]["Insert"]>;
        Relationships: [];
      };
      capacity_snapshots: {
        Row: { id: string; organization_id: string | null; calculated_at: string; overall_capacity_percent: number; confidence_score: number; cron_pressure_score: number; retry_backlog_score: number; reminder_failure_pressure_score: number; webhook_pressure_score: number; import_queue_pressure_score: number; db_pressure_score: number; error_budget_pressure_score: number; support_overload_score: number; snapshot_version: string; details_json: Json };
        Insert: { id?: string; organization_id?: string | null; calculated_at?: string; overall_capacity_percent: number; confidence_score: number; cron_pressure_score: number; retry_backlog_score: number; reminder_failure_pressure_score: number; webhook_pressure_score: number; import_queue_pressure_score: number; db_pressure_score: number; error_budget_pressure_score: number; support_overload_score: number; snapshot_version: string; details_json?: Json };
        Update: Partial<Database["public"]["Tables"]["capacity_snapshots"]["Insert"]>;
        Relationships: [];
      };
      metric_alerts: {
        Row: { id: string; organization_id: string | null; metric_key: string; severity: string; status: string; opened_at: string; closed_at: string | null; evidence_json: Json };
        Insert: { id?: string; organization_id?: string | null; metric_key: string; severity: string; status: string; opened_at?: string; closed_at?: string | null; evidence_json?: Json };
        Update: Partial<Database["public"]["Tables"]["metric_alerts"]["Insert"]>;
        Relationships: [];
      };
      support_time_logs: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; category: string; minutes_spent: number; ticket_ref: string | null; notes: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; category: string; minutes_spent: number; ticket_ref?: string | null; notes?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["support_time_logs"]["Insert"]>;
        Relationships: [];
      };
      onboarding_time_logs: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; category: string; minutes_spent: number; engagement_ref: string | null; notes: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; category: string; minutes_spent: number; engagement_ref?: string | null; notes?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["onboarding_time_logs"]["Insert"]>;
        Relationships: [];
      };
      cost_usage_logs: {
        Row: { id: string; organization_id: string; cost_category: string; quantity: number; unit: string; estimated_cost: number; reference_key: string | null; details: Json; captured_at: string };
        Insert: { id?: string; organization_id: string; cost_category: string; quantity?: number; unit: string; estimated_cost?: number; reference_key?: string | null; details?: Json; captured_at?: string };
        Update: Partial<Database["public"]["Tables"]["cost_usage_logs"]["Insert"]>;
        Relationships: [];
      };
      organization_profitability_snapshots: {
        Row: { id: string; organization_id: string; calculated_at: string; monthly_recurring_revenue: number; support_minutes_30d: number; onboarding_minutes_30d: number; estimated_usage_cost_30d: number; estimated_service_cost_30d: number; contribution_margin_30d: number; margin_risk_status: string; details_json: Json };
        Insert: { id?: string; organization_id: string; calculated_at?: string; monthly_recurring_revenue?: number; support_minutes_30d?: number; onboarding_minutes_30d?: number; estimated_usage_cost_30d?: number; estimated_service_cost_30d?: number; contribution_margin_30d?: number; margin_risk_status?: string; details_json?: Json };
        Update: Partial<Database["public"]["Tables"]["organization_profitability_snapshots"]["Insert"]>;
        Relationships: [];
      };
      organization_health_snapshots: {
        Row: { id: string; organization_id: string; calculated_at: string; activation_score: number; retention_score: number; commercial_score: number; support_burden_score: number; trust_score: number; overall_health_score: number; status: string; details_json: Json };
        Insert: { id?: string; organization_id: string; calculated_at?: string; activation_score?: number; retention_score?: number; commercial_score?: number; support_burden_score?: number; trust_score?: number; overall_health_score?: number; status?: string; details_json?: Json };
        Update: Partial<Database["public"]["Tables"]["organization_health_snapshots"]["Insert"]>;
        Relationships: [];
      };
      data_export_requests: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; export_scope: string; format: string; status: string; requested_at: string; completed_at: string | null; evidence_json: Json };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; export_scope?: string; format?: string; status?: string; requested_at?: string; completed_at?: string | null; evidence_json?: Json };
        Update: Partial<Database["public"]["Tables"]["data_export_requests"]["Insert"]>;
        Relationships: [];
      };
      deletion_requests: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; scope: string; status: string; requested_at: string; scheduled_for: string | null; completed_at: string | null; evidence_json: Json };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; scope?: string; status?: string; requested_at?: string; scheduled_for?: string | null; completed_at?: string | null; evidence_json?: Json };
        Update: Partial<Database["public"]["Tables"]["deletion_requests"]["Insert"]>;
        Relationships: [];
      };
      backup_readiness_checks: {
        Row: { id: string; environment: string; status: string; checked_at: string; restore_tested_at: string | null; summary: string | null; evidence_json: Json };
        Insert: { id?: string; environment?: string; status: string; checked_at?: string; restore_tested_at?: string | null; summary?: string | null; evidence_json?: Json };
        Update: Partial<Database["public"]["Tables"]["backup_readiness_checks"]["Insert"]>;
        Relationships: [];
      };
      ocr_jobs: {
        Row: { id: string; organization_id: string; contract_id: string; contract_file_id: string; provider: string; status: string; detection_reason: string | null; attempts: number; error_message: string | null; queued_at: string; started_at: string | null; completed_at: string | null; details_json: Json };
        Insert: { id?: string; organization_id: string; contract_id: string; contract_file_id: string; provider: string; status?: string; detection_reason?: string | null; attempts?: number; error_message?: string | null; queued_at?: string; started_at?: string | null; completed_at?: string | null; details_json?: Json };
        Update: Partial<Database["public"]["Tables"]["ocr_jobs"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: { id: string; organization_id: string; user_id: string; role: string; created_at: string };
        Insert: { id?: string; organization_id: string; user_id: string; role?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [];
      };
      notes: {
        Row: { id: string; contract_id: string; organization_id: string; author_user_id: string; body: string; created_at: string };
        Insert: { id?: string; contract_id: string; organization_id: string; author_user_id: string; body: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: [];
      };
      notification_logs: {
        Row: { id: string; reminder_id: string | null; organization_id: string; recipient_email: string; channel: string; status: string; provider_message_id: string | null; error_message: string | null; sent_at: string; notification_kind: string; destination: string | null; delivery_key: string | null; provider_payload: Json };
        Insert: { id?: string; reminder_id?: string | null; organization_id: string; recipient_email: string; channel?: string; status: string; provider_message_id?: string | null; error_message?: string | null; sent_at?: string; notification_kind?: string; destination?: string | null; delivery_key?: string | null; provider_payload?: Json };
        Update: Partial<Database["public"]["Tables"]["notification_logs"]["Insert"]>;
        Relationships: [];
      };
        organizations: {
          Row: { id: string; name: string; slug: string; created_by: string; created_at: string; billing_email: string | null; billing_provider: string | null; billing_customer_id: string | null; billing_subscription_id: string | null; billing_plan_code: string | null; billing_price_id: string | null; billing_subscription_status: string | null; billing_current_period_end: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; stripe_price_id: string | null; plan_tier: string; subscription_status: string; subscription_current_period_end: string | null; slack_webhook_url: string | null; slack_channel: string | null; slack_fallback_channel: string | null; teams_webhook_url: string | null; teams_fallback_channel: string | null; trial_started_at: string | null; trial_ends_at: string | null; acquisition_source: string | null; acquisition_campaign: string | null };
          Insert: { id?: string; name: string; slug: string; created_by: string; created_at?: string; billing_email?: string | null; billing_provider?: string | null; billing_customer_id?: string | null; billing_subscription_id?: string | null; billing_plan_code?: string | null; billing_price_id?: string | null; billing_subscription_status?: string | null; billing_current_period_end?: string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; stripe_price_id?: string | null; plan_tier?: string; subscription_status?: string; subscription_current_period_end?: string | null; slack_webhook_url?: string | null; slack_channel?: string | null; slack_fallback_channel?: string | null; teams_webhook_url?: string | null; teams_fallback_channel?: string | null; trial_started_at?: string | null; trial_ends_at?: string | null; acquisition_source?: string | null; acquisition_campaign?: string | null };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      processing_errors: {
        Row: { id: string; organization_id: string; contract_id: string; contract_file_id: string | null; stage: string; error_message: string; details: Json; resolved_at: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; contract_file_id?: string | null; stage: string; error_message: string; details?: Json; resolved_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["processing_errors"]["Insert"]>;
        Relationships: [];
      };
      saas_renewal_import_batches: {
        Row: { id: string; organization_id: string; uploaded_by_user_id: string | null; original_filename: string; status: string; total_rows: number; ready_count: number; needs_review_count: number; rejected_count: number; activated_count: number; dismissed_count: number; spend_at_risk_amount: number | null; spend_at_risk_currency: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; uploaded_by_user_id?: string | null; original_filename: string; status?: string; total_rows?: number; ready_count?: number; needs_review_count?: number; rejected_count?: number; activated_count?: number; dismissed_count?: number; spend_at_risk_amount?: number | null; spend_at_risk_currency?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["saas_renewal_import_batches"]["Insert"]>;
        Relationships: [];
      };
      saas_renewal_import_rows: {
        Row: { id: string; organization_id: string; batch_id: string; row_number: number; status: string; review_note: string | null; original_row_json: Json; normalized_row_json: Json; issue_codes: string[]; correction_json: Json; weak_evidence_accepted: boolean; duplicate_confirmed: boolean; activated_at: string | null; reviewed_at: string | null; reviewed_by_user_id: string | null; dismissed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; batch_id: string; row_number: number; status: string; review_note?: string | null; original_row_json?: Json; normalized_row_json?: Json; issue_codes?: string[]; correction_json?: Json; weak_evidence_accepted?: boolean; duplicate_confirmed?: boolean; activated_at?: string | null; reviewed_at?: string | null; reviewed_by_user_id?: string | null; dismissed_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["saas_renewal_import_rows"]["Insert"]>;
        Relationships: [];
      };
      saas_software_inventory: {
        Row: { id: string; organization_id: string; name: string; vendor_name: string | null; category: string | null; owner_user_id: string | null; status: string; source_contract_id: string | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; name: string; vendor_name?: string | null; category?: string | null; owner_user_id?: string | null; status?: string; source_contract_id?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["saas_software_inventory"]["Insert"]>;
        Relationships: [];
      };
      saas_contract_terms: {
        Row: { id: string; organization_id: string; software_id: string; contract_id: string | null; renewal_date: string | null; expiration_date: string | null; auto_renewal: boolean; notice_period_value: number | null; notice_period_unit: string | null; notice_deadline_date: string | null; term_summary: string | null; contract_value_amount: number | null; contract_value_currency: string | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; software_id: string; contract_id?: string | null; renewal_date?: string | null; expiration_date?: string | null; auto_renewal?: boolean; notice_period_value?: number | null; notice_period_unit?: string | null; notice_deadline_date?: string | null; term_summary?: string | null; contract_value_amount?: number | null; contract_value_currency?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["saas_contract_terms"]["Insert"]>;
        Relationships: [];
      };
      saas_opt_out_windows: {
        Row: { id: string; organization_id: string; software_id: string; contract_term_id: string; opt_out_deadline: string; window_opens_on: string | null; window_closes_on: string | null; status: string; source: string; owner_user_id: string | null; workflow_status: string; next_action: string | null; next_action_due_at: string | null; resolved_at: string | null; accepted_risk_at: string | null; ignored_at: string | null; decision_recorded_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; software_id: string; contract_term_id: string; opt_out_deadline: string; window_opens_on?: string | null; window_closes_on?: string | null; status?: string; source?: string; owner_user_id?: string | null; workflow_status?: string; next_action?: string | null; next_action_due_at?: string | null; resolved_at?: string | null; accepted_risk_at?: string | null; ignored_at?: string | null; decision_recorded_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["saas_opt_out_windows"]["Insert"]>;
        Relationships: [];
      };
      saas_contract_risk_findings: {
        Row: { id: string; organization_id: string; software_id: string; contract_term_id: string | null; opt_out_window_id: string | null; finding_type: string; severity: string; status: string; evidence_json: Json; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; software_id: string; contract_term_id?: string | null; opt_out_window_id?: string | null; finding_type: string; severity: string; status?: string; evidence_json?: Json; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["saas_contract_risk_findings"]["Insert"]>;
        Relationships: [];
      };
      saas_contract_metadata_conflict_resolutions: {
        Row: { id: string; organization_id: string; contract_id: string; software_id: string; saas_term_id: string; field_name: string; contract_value_json: Json; saas_value_json: Json; trusted_source: string; manual_override_json: Json | null; resolution_reason: string; resolved_by_user_id: string | null; resolved_at: string; reopened_by_user_id: string | null; reopened_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; software_id: string; saas_term_id: string; field_name: string; contract_value_json?: Json; saas_value_json?: Json; trusted_source: string; manual_override_json?: Json | null; resolution_reason: string; resolved_by_user_id?: string | null; resolved_at?: string; reopened_by_user_id?: string | null; reopened_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["saas_contract_metadata_conflict_resolutions"]["Insert"]>;
        Relationships: [];
      };
      reminders: {
        Row: { id: string; contract_id: string; organization_id: string; reminder_type: string; remind_at: string; recipient_email: string; recipient_emails: Json; status: string; source: string; sent_at: string | null; created_at: string; rule_name: string | null; escalation_level: number; ical_uid: string | null; delivery_key: string | null; attempt_count: number; max_attempts: number; next_retry_at: string | null; last_attempt_at: string | null; last_error: string | null; processing_started_at: string | null; processing_token: string | null };
        Insert: { id?: string; contract_id: string; organization_id: string; reminder_type: string; remind_at: string; recipient_email: string; recipient_emails?: Json; status?: string; source?: string; sent_at?: string | null; created_at?: string; rule_name?: string | null; escalation_level?: number; ical_uid?: string | null; delivery_key?: string | null; attempt_count?: number; max_attempts?: number; next_retry_at?: string | null; last_attempt_at?: string | null; last_error?: string | null; processing_started_at?: string | null; processing_token?: string | null };
        Update: Partial<Database["public"]["Tables"]["reminders"]["Insert"]>;
        Relationships: [];
      };
      reminder_runs: {
        Row: { id: string; reminder_id: string; organization_id: string; idempotency_key: string; status: string; error_message: string | null; created_at: string };
        Insert: { id?: string; reminder_id: string; organization_id: string; idempotency_key: string; status: string; error_message?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["reminder_runs"]["Insert"]>;
        Relationships: [];
      };
      playbook_runs: {
        Row: { id: string; contract_id: string; organization_id: string; playbook_id: string; selected_steps: Json; created_at: string };
        Insert: { id?: string; contract_id: string; organization_id: string; playbook_id: string; selected_steps?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["playbook_runs"]["Insert"]>;
        Relationships: [];
      };
      playbooks: {
        Row: { id: string; organization_id: string; name: string; description: string | null; steps: Json; created_at: string };
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; steps?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["playbooks"]["Insert"]>;
        Relationships: [];
      };
      renewal_decisions: {
        Row: { id: string; contract_id: string; organization_id: string; author_user_id: string | null; status: string; decision_date: string | null; summary: string; next_steps: Json; created_at: string };
        Insert: { id?: string; contract_id: string; organization_id: string; author_user_id?: string | null; status: string; decision_date?: string | null; summary: string; next_steps?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_decisions"]["Insert"]>;
        Relationships: [];
      };
      renewal_action_requests: {
        Row: { id: string; contract_id: string; organization_id: string; requested_by_user_id: string | null; requested_to_user_id: string; request_status: string; requested_action: string; due_date: string | null; due_at: string | null; message: string | null; response_status: string | null; response_note: string | null; completed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; contract_id: string; organization_id: string; requested_by_user_id?: string | null; requested_to_user_id: string; request_status?: string; requested_action?: string; due_date?: string | null; due_at?: string | null; message?: string | null; response_status?: string | null; response_note?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_action_requests"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: { id: string; full_name: string | null; notification_email: string | null; default_organization_id: string | null; created_at: string; monthly_digest_enabled: boolean };
        Insert: { id: string; full_name?: string | null; notification_email?: string | null; default_organization_id?: string | null; created_at?: string; monthly_digest_enabled?: boolean };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      assign_contract_owner_and_expire_requests: {
        Args: { p_contract_id: string; p_new_owner_user_id?: string | null };
        Returns: Array<{ contract_id: string; organization_id: string; previous_owner_user_id: string | null; new_owner_user_id: string | null; expired_request_ids: string[] | null; expired_count: number | null }>;
      };
      create_renewal_action_request: {
        Args: { p_contract_id: string; p_due_date: string; p_message?: string | null };
        Returns: Array<{ id: string; contract_id: string; organization_id: string; requested_to_user_id: string; request_status: string; requested_action: string; due_date: string | null; due_at: string | null; created: boolean }>;
      };
      expire_renewal_action_request: {
        Args: { p_request_id: string };
        Returns: Array<{ id: string; contract_id: string; organization_id: string; requested_to_user_id: string; request_status: string; completed_at: string | null; transitioned: boolean }>;
      };
      respond_renewal_action_request: {
        Args: { p_request_id: string; p_target_status: string; p_response_status: string; p_response_note?: string | null };
        Returns: Array<{ id: string; contract_id: string; organization_id: string; requested_to_user_id: string; request_status: string; response_status: string | null; completed_at: string | null; transitioned: boolean }>;
      };
    };
    Enums: Record<string, never>;
  };
};
