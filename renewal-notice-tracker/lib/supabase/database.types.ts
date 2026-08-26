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
      contract_extraction_runs: {
        Row: { id: string; organization_id: string; contract_id: string; contract_file_id: string | null; provider: string; status: string; extraction_mode: string; requested_by_user_id: string | null; started_at: string | null; completed_at: string | null; failed_at: string | null; safe_error_message: string | null; idempotency_key: string | null; schema_version: string; prompt_version: string | null; model: string | null; page_count: number; processed_page_count: number; input_character_count: number; input_token_count: number | null; output_token_count: number | null; estimated_cost: number | null; attempt_count: number; next_attempt_at: string | null; processing_lease_expires_at: string | null; warning_codes: string[]; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; contract_file_id?: string | null; provider?: string; status?: string; extraction_mode?: string; requested_by_user_id?: string | null; started_at?: string | null; completed_at?: string | null; failed_at?: string | null; safe_error_message?: string | null; idempotency_key?: string | null; schema_version?: string; prompt_version?: string | null; model?: string | null; page_count?: number; processed_page_count?: number; input_character_count?: number; input_token_count?: number | null; output_token_count?: number | null; estimated_cost?: number | null; attempt_count?: number; next_attempt_at?: string | null; processing_lease_expires_at?: string | null; warning_codes?: string[]; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["contract_extraction_runs"]["Insert"]>;
        Relationships: [];
      };
      contract_document_pages: {
        Row: { id: string; organization_id: string; contract_id: string; contract_file_id: string; extraction_run_id: string; page_number: number; section_heading: string | null; normalized_text: string; text_hash: string; character_start: number; character_end: number; extraction_method: string; ocr_confidence: number | null; warning_codes: string[]; retention_expires_at: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; contract_file_id: string; extraction_run_id: string; page_number: number; section_heading?: string | null; normalized_text: string; text_hash: string; character_start?: number; character_end?: number; extraction_method: string; ocr_confidence?: number | null; warning_codes?: string[]; retention_expires_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["contract_document_pages"]["Insert"]>;
        Relationships: [];
      };
      contract_extracted_fields: {
        Row: { id: string; organization_id: string; contract_id: string; extraction_run_id: string; field_key: string; field_category: string; candidate_index: number; extracted_value: Json; normalized_value: Json | null; confidence: number; evidence_status: string; source_file_id: string | null; source_page: number | null; source_snippet: string | null; source_offsets: Json | null; source_document_page_id: string | null; source_section_label: string | null; source_clause_label: string | null; extraction_method: string | null; extraction_provider: string | null; extraction_model: string | null; prompt_version: string | null; schema_version: string; warning_codes: string[]; edited_value: Json | null; override_reason: string | null; supersedes_field_id: string | null; reviewed_by_user_id: string | null; reviewed_at: string | null; applied_to_contract_at: string | null; rejected_at: string | null; rejection_reason: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; extraction_run_id: string; field_key: string; field_category?: string; candidate_index?: number; extracted_value: Json; normalized_value?: Json | null; confidence: number; evidence_status?: string; source_file_id?: string | null; source_page?: number | null; source_snippet?: string | null; source_offsets?: Json | null; source_document_page_id?: string | null; source_section_label?: string | null; source_clause_label?: string | null; extraction_method?: string | null; extraction_provider?: string | null; extraction_model?: string | null; prompt_version?: string | null; schema_version?: string; warning_codes?: string[]; edited_value?: Json | null; override_reason?: string | null; supersedes_field_id?: string | null; reviewed_by_user_id?: string | null; reviewed_at?: string | null; applied_to_contract_at?: string | null; rejected_at?: string | null; rejection_reason?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["contract_extracted_fields"]["Insert"]>;
        Relationships: [];
      };
      contract_document_relationships: {
        Row: { id: string; organization_id: string; contract_id: string; source_file_id: string; target_file_id: string; relationship_type: string; effective_date: string | null; confidence: number; evidence_status: string; evidence_field_ids: string[]; reviewed_by_user_id: string | null; reviewed_at: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; source_file_id: string; target_file_id: string; relationship_type: string; effective_date?: string | null; confidence?: number; evidence_status?: string; evidence_field_ids?: string[]; reviewed_by_user_id?: string | null; reviewed_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["contract_document_relationships"]["Insert"]>;
        Relationships: [];
      };
      contract_commercial_calculations: {
        Row: { id: string; organization_id: string; contract_id: string; calculation_type: string; calculation_version: string; status: string; amount: number | null; currency: string | null; percentage: number | null; date_value: string | null; explanation: string; source_field_ids: string[]; warning_codes: string[]; created_at: string; superseded_at: string | null };
        Insert: { id?: string; organization_id: string; contract_id: string; calculation_type: string; calculation_version: string; status: string; amount?: number | null; currency?: string | null; percentage?: number | null; date_value?: string | null; explanation: string; source_field_ids?: string[]; warning_codes?: string[]; created_at?: string; superseded_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["contract_commercial_calculations"]["Insert"]>;
        Relationships: [];
      };
      contract_commercial_findings: {
        Row: { id: string; organization_id: string; contract_id: string; extraction_run_id: string | null; reason_code: string; severity: string; confidence: number; explanation: string; financial_impact_min: number | null; financial_impact_max: number | null; currency: string | null; evidence_field_ids: string[]; limitations: string[]; recommended_human_action: string; calculation_version: string; taxonomy_version: string; status: string; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; extraction_run_id?: string | null; reason_code: string; severity: string; confidence: number; explanation: string; financial_impact_min?: number | null; financial_impact_max?: number | null; currency?: string | null; evidence_field_ids?: string[]; limitations?: string[]; recommended_human_action: string; calculation_version: string; taxonomy_version: string; status?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["contract_commercial_findings"]["Insert"]>;
        Relationships: [];
      };
      contract_metadata: {
        Row: { id: string; contract_id: string; contract_title: string | null; counterparty_name: string | null; contract_type: string | null; effective_date: string | null; renewal_date: string | null; expiration_date: string | null; auto_renewal: boolean | null; renewal_term: string | null; notice_period_value: number | null; notice_period_unit: string | null; notice_deadline_date: string | null; termination_window: string | null; governing_law: string | null; payment_terms: string | null; contract_value_amount: number | null; contract_value_currency: string | null; contract_value_period: string | null; price_change_trigger: string | null; payment_trigger: string | null; financial_data_trust_status: string | null; extracted_clauses: Json; field_confidence: Json; field_source_snippets: Json; reminder_recommendations: Json; needs_review: boolean; reviewer_notes: string | null; review_mode: string | null; review_reason: string | null; has_conflict: boolean; has_derived_date: boolean; has_weak_evidence: boolean; is_ocr_assisted: boolean; is_manual_without_evidence: boolean; changes_previously_verified_p0: boolean; accepted_unverified_risk_requested: boolean; reviewed_at: string | null; reviewed_by: string | null; financial_terms_reviewed_at: string | null; deadline_verified_at: string | null; deadline_timezone: string | null; created_at: string; updated_at: string; contract_template_key: string | null };
        Insert: { id?: string; contract_id: string; contract_title?: string | null; counterparty_name?: string | null; contract_type?: string | null; effective_date?: string | null; renewal_date?: string | null; expiration_date?: string | null; auto_renewal?: boolean | null; renewal_term?: string | null; notice_period_value?: number | null; notice_period_unit?: string | null; notice_deadline_date?: string | null; termination_window?: string | null; governing_law?: string | null; payment_terms?: string | null; contract_value_amount?: number | null; contract_value_currency?: string | null; contract_value_period?: string | null; price_change_trigger?: string | null; payment_trigger?: string | null; financial_data_trust_status?: string | null; extracted_clauses?: Json; field_confidence?: Json; field_source_snippets?: Json; reminder_recommendations?: Json; needs_review?: boolean; reviewer_notes?: string | null; review_mode?: string | null; review_reason?: string | null; has_conflict?: boolean; has_derived_date?: boolean; has_weak_evidence?: boolean; is_ocr_assisted?: boolean; is_manual_without_evidence?: boolean; changes_previously_verified_p0?: boolean; accepted_unverified_risk_requested?: boolean; reviewed_at?: string | null; reviewed_by?: string | null; financial_terms_reviewed_at?: string | null; deadline_verified_at?: string | null; deadline_timezone?: string | null; created_at?: string; updated_at?: string; contract_template_key?: string | null };
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
        Row: { id: string; organization_id: string; created_by: string; status: string; source_type: string; is_sample: boolean; latest_file_id: string | null; created_at: string; updated_at: string; owner_user_id: string | null; owner_confirmed_at: string | null; owner_confirmed_by_user_id: string | null; department: string | null; department_confirmed_at: string | null; status_tag: string; counterparty_id: string | null; renewal_decision_status: string; renewal_decision_date: string | null; cycle_status: string; last_acknowledged_at: string | null; last_acknowledged_by: string | null };
        Insert: { id?: string; organization_id: string; created_by: string; status?: string; source_type?: string; is_sample?: boolean; latest_file_id?: string | null; created_at?: string; updated_at?: string; owner_user_id?: string | null; owner_confirmed_at?: string | null; owner_confirmed_by_user_id?: string | null; department?: string | null; department_confirmed_at?: string | null; status_tag?: string; counterparty_id?: string | null; renewal_decision_status?: string; renewal_decision_date?: string | null; cycle_status?: string; last_acknowledged_at?: string | null; last_acknowledged_by?: string | null };
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
        Row: { id: string; reminder_id: string | null; organization_id: string; recipient_email: string; channel: string; status: string; provider_message_id: string | null; error_message: string | null; sent_at: string; notification_kind: string; destination: string | null; delivery_key: string | null; provider_payload: Json; attempt_count: number; max_attempts: number; next_retry_at: string | null; processing_started_at: string | null; processing_token: string | null; last_attempt_at: string | null };
        Insert: { id?: string; reminder_id?: string | null; organization_id: string; recipient_email: string; channel?: string; status: string; provider_message_id?: string | null; error_message?: string | null; sent_at?: string; notification_kind?: string; destination?: string | null; delivery_key?: string | null; provider_payload?: Json; attempt_count?: number; max_attempts?: number; next_retry_at?: string | null; processing_started_at?: string | null; processing_token?: string | null; last_attempt_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["notification_logs"]["Insert"]>;
        Relationships: [];
      };
      renewal_action_notification_payloads: {
        Row: { id: string; organization_id: string; notification_log_id: string; request_id: string; contract_id: string; delivery_key: string; template_version: string; delivery_payload: Json; payload_fingerprint: string | null; created_at: string; expires_at: string };
        Insert: { id?: string; organization_id: string; notification_log_id: string; request_id: string; contract_id: string; delivery_key: string; template_version: string; delivery_payload: Json; payload_fingerprint?: string | null; created_at?: string; expires_at: string };
        Update: Partial<Database["public"]["Tables"]["renewal_action_notification_payloads"]["Insert"]>;
        Relationships: [];
      };
        organizations: {
          Row: { id: string; name: string; slug: string; created_by: string; created_at: string; timezone: string | null; billing_email: string | null; billing_provider: string | null; billing_customer_id: string | null; billing_subscription_id: string | null; billing_plan_code: string | null; billing_price_id: string | null; billing_subscription_status: string | null; billing_current_period_end: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; stripe_price_id: string | null; plan_tier: string; subscription_status: string; subscription_current_period_end: string | null; slack_webhook_url: string | null; slack_channel: string | null; slack_fallback_channel: string | null; teams_webhook_url: string | null; teams_fallback_channel: string | null; trial_started_at: string | null; trial_ends_at: string | null; acquisition_source: string | null; acquisition_campaign: string | null };
          Insert: { id?: string; name: string; slug: string; created_by: string; created_at?: string; timezone?: string | null; billing_email?: string | null; billing_provider?: string | null; billing_customer_id?: string | null; billing_subscription_id?: string | null; billing_plan_code?: string | null; billing_price_id?: string | null; billing_subscription_status?: string | null; billing_current_period_end?: string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; stripe_price_id?: string | null; plan_tier?: string; subscription_status?: string; subscription_current_period_end?: string | null; slack_webhook_url?: string | null; slack_channel?: string | null; slack_fallback_channel?: string | null; teams_webhook_url?: string | null; teams_fallback_channel?: string | null; trial_started_at?: string | null; trial_ends_at?: string | null; acquisition_source?: string | null; acquisition_campaign?: string | null };
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
      subscription_usage_provider_connections: {
        Row: { id: string; organization_id: string; provider: string; provider_tenant_id: string; provider_tenant_name: string | null; status: string; credential_reference: string; credential_fingerprint: string; required_permissions: string[]; requested_permissions: string[]; verified_permissions: string[]; last_verified_at: string | null; connection_owner_user_id: string | null; last_successful_sync_at: string | null; last_error_code: string | null; next_scheduled_sync_at: string | null; sync_claim_token: string | null; sync_claimed_at: string | null; sync_claim_expires_at: string | null; disconnected_at: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; provider: string; provider_tenant_id: string; provider_tenant_name?: string | null; status?: string; credential_reference: string; credential_fingerprint: string; required_permissions?: string[]; requested_permissions?: string[]; verified_permissions?: string[]; last_verified_at?: string | null; connection_owner_user_id?: string | null; last_successful_sync_at?: string | null; last_error_code?: string | null; next_scheduled_sync_at?: string | null; sync_claim_token?: string | null; sync_claimed_at?: string | null; sync_claim_expires_at?: string | null; disconnected_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["subscription_usage_provider_connections"]["Insert"]>;
        Relationships: [];
      };
      subscription_usage_provider_credentials: {
        Row: { id: string; organization_id: string; provider_connection_id: string; provider: string; encrypted_credential: string; credential_fingerprint: string; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; provider_connection_id: string; provider: string; encrypted_credential: string; credential_fingerprint: string; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["subscription_usage_provider_credentials"]["Insert"]>;
        Relationships: [];
      };
      subscription_usage_consent_attempts: {
        Row: { id: string; organization_id: string; actor_user_id: string; provider: string; nonce_hash: string; status: string; requested_permissions: string[]; expires_at: string; consumed_at: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; actor_user_id: string; provider: string; nonce_hash: string; status?: string; requested_permissions?: string[]; expires_at: string; consumed_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["subscription_usage_consent_attempts"]["Insert"]>;
        Relationships: [];
      };
      subscription_usage_analysis_scopes: {
        Row: { id: string; organization_id: string; scope_key: string; scope_family_key: string; current_batch_id: string; snapshot_batch_ids: string[]; provider_set: string[]; calculation_version: string; include_manual_imports: boolean; created_by_user_id: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; scope_key: string; scope_family_key: string; current_batch_id: string; snapshot_batch_ids: string[]; provider_set: string[]; calculation_version: string; include_manual_imports?: boolean; created_by_user_id?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["subscription_usage_analysis_scopes"]["Insert"]>;
        Relationships: [];
      };
      subscription_usage_analysis_findings: {
        Row: { organization_id: string; analysis_scope_id: string; finding_id: string; created_at: string };
        Insert: { organization_id: string; analysis_scope_id: string; finding_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["subscription_usage_analysis_findings"]["Insert"]>;
        Relationships: [];
      };
      subscription_usage_sync_runs: {
        Row: { id: string; organization_id: string; provider_connection_id: string; provider: string; status: string; idempotency_key: string; logical_interval_key: string | null; attempt_number: number; maximum_attempts: number; previous_attempt_id: string | null; retry_after: string | null; current_stage: string; failure_stage: string | null; stage_updated_at: string; usage_import_batch_id: string | null; started_at: string | null; completed_at: string | null; failed_at: string | null; duration_ms: number | null; row_count: number; finding_count: number; retry_count: number; provider_error_category: string | null; last_error_code: string | null; cursor_checkpoint: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; provider_connection_id: string; provider: string; status?: string; idempotency_key: string; logical_interval_key?: string | null; attempt_number?: number; maximum_attempts?: number; previous_attempt_id?: string | null; retry_after?: string | null; current_stage?: string; failure_stage?: string | null; stage_updated_at?: string; usage_import_batch_id?: string | null; started_at?: string | null; completed_at?: string | null; failed_at?: string | null; duration_ms?: number | null; row_count?: number; finding_count?: number; retry_count?: number; provider_error_category?: string | null; last_error_code?: string | null; cursor_checkpoint?: string | null; metadata?: Json; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["subscription_usage_sync_runs"]["Insert"]>;
        Relationships: [];
      };
      design_partner_beta_controls: {
        Row: { organization_id: string; status: string; maximum_contracts: number; maximum_provider_connections: number; maximum_user_seats: number; allowed_providers: string[]; starts_at: string | null; expires_at: string | null; grace_ends_at: string | null; founder_approved_at: string | null; founder_approved_by_user_id: string | null; onboarding_call_completed_at: string | null; created_at: string; updated_at: string };
        Insert: { organization_id: string; status?: string; maximum_contracts?: number; maximum_provider_connections?: number; maximum_user_seats?: number; allowed_providers?: string[]; starts_at?: string | null; expires_at?: string | null; grace_ends_at?: string | null; founder_approved_at?: string | null; founder_approved_by_user_id?: string | null; onboarding_call_completed_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["design_partner_beta_controls"]["Insert"]>;
        Relationships: [];
      };
      usage_import_batches: {
        Row: { id: string; organization_id: string; actor_user_id: string | null; source: string; status: string; row_count: number; metadata: Json; idempotency_key: string | null; file_name: string | null; template_version: string; committed_at: string | null; completed_at: string | null; failed_at: string | null; error_count: number; ready_count: number; rejected_count: number; partial_success: boolean; provider: string | null; provider_connection_id: string | null; sync_run_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; actor_user_id?: string | null; source: string; status?: string; row_count?: number; metadata?: Json; idempotency_key?: string | null; file_name?: string | null; template_version?: string; committed_at?: string | null; completed_at?: string | null; failed_at?: string | null; error_count?: number; ready_count?: number; rejected_count?: number; partial_success?: boolean; provider?: string | null; provider_connection_id?: string | null; sync_run_id?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["usage_import_batches"]["Insert"]>;
        Relationships: [];
      };
      usage_import_rows: {
        Row: { id: string; organization_id: string; batch_id: string; row_number: number; vendor_name: string | null; product_name: string | null; seats_purchased: number | null; seats_used: number | null; spend_amount: number | null; currency: string | null; normalized_product: string | null; product_category: string | null; annual_reviewed_cost: number | null; purchased_seats: number | null; assigned_seats: number | null; active_users_30d: number | null; active_users_90d: number | null; last_activity_at: string | null; department: string | null; owner_label: string | null; contract_reference: string | null; source_label: string | null; collected_at: string | null; trust_state: string; confidence: number; validation_status: string; issue_codes: string[]; warning_codes: string[]; evidence_state: string; source_row_hash: string | null; is_sample: boolean; provider: string | null; provider_connection_id: string | null; sync_run_id: string | null; external_product_id: string | null; normalized_payload: Json; created_at: string };
        Insert: { id?: string; organization_id: string; batch_id: string; row_number: number; vendor_name?: string | null; product_name?: string | null; seats_purchased?: number | null; seats_used?: number | null; spend_amount?: number | null; currency?: string | null; normalized_product?: string | null; product_category?: string | null; annual_reviewed_cost?: number | null; purchased_seats?: number | null; assigned_seats?: number | null; active_users_30d?: number | null; active_users_90d?: number | null; last_activity_at?: string | null; department?: string | null; owner_label?: string | null; contract_reference?: string | null; source_label?: string | null; collected_at?: string | null; trust_state?: string; confidence?: number; validation_status?: string; issue_codes?: string[]; warning_codes?: string[]; evidence_state?: string; source_row_hash?: string | null; is_sample?: boolean; provider?: string | null; provider_connection_id?: string | null; sync_run_id?: string | null; external_product_id?: string | null; normalized_payload?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["usage_import_rows"]["Insert"]>;
        Relationships: [];
      };
      license_waste_opportunities: {
        Row: { id: string; organization_id: string; contract_id: string | null; usage_batch_id: string | null; analysis_scope_id: string | null; scope_family_key: string | null; logical_opportunity_key: string | null; evidence_hash: string | null; material_evidence_hash: string | null; provenance_hash: string | null; revision_of_id: string | null; reactivated_from_finding_id: string | null; revision_number: number; revision_reason: string | null; requires_new_review: boolean; previous_review_status: string | null; resolved_at: string | null; resolution_reason: string | null; resolved_by_user_id: string | null; finding_type: string; estimated_savings: number | null; currency: string | null; evidence: Json; status: string; reason_code: string | null; calculation_version: string | null; calculation_family: string | null; usage_row_ids: string[]; matched_contract_ids: string[]; utilization: number | null; unused_seats: number | null; confidence: number; warnings: string[]; recommended_action: string | null; review_status: string; reviewed_by_user_id: string | null; reviewed_at: string | null; accepted_action: string | null; realized_savings: number | null; is_sample: boolean; provider: string | null; provider_connection_id: string | null; sync_run_id: string | null; finding_fingerprint: string | null; superseded_at: string | null; superseded_by_sync_run_id: string | null; capability_category: string | null; taxonomy_version: string | null; taxonomy_family: string | null; involved_providers: string[]; involved_products: string[]; estimated_savings_min: number | null; estimated_savings_max: number | null; feedback_classification: string | null; feedback_reason: string | null; created_at: string };
        Insert: { id?: string; organization_id: string; contract_id?: string | null; usage_batch_id?: string | null; analysis_scope_id?: string | null; scope_family_key?: string | null; logical_opportunity_key?: string | null; evidence_hash?: string | null; material_evidence_hash?: string | null; provenance_hash?: string | null; revision_of_id?: string | null; reactivated_from_finding_id?: string | null; revision_number?: number; revision_reason?: string | null; requires_new_review?: boolean; previous_review_status?: string | null; resolved_at?: string | null; resolution_reason?: string | null; resolved_by_user_id?: string | null; finding_type: string; estimated_savings?: number | null; currency?: string | null; evidence?: Json; status?: string; reason_code?: string | null; calculation_version?: string | null; calculation_family?: string | null; usage_row_ids?: string[]; matched_contract_ids?: string[]; utilization?: number | null; unused_seats?: number | null; confidence?: number; warnings?: string[]; recommended_action?: string | null; review_status?: string; reviewed_by_user_id?: string | null; reviewed_at?: string | null; accepted_action?: string | null; realized_savings?: number | null; is_sample?: boolean; provider?: string | null; provider_connection_id?: string | null; sync_run_id?: string | null; finding_fingerprint?: string | null; superseded_at?: string | null; superseded_by_sync_run_id?: string | null; capability_category?: string | null; taxonomy_version?: string | null; taxonomy_family?: string | null; involved_providers?: string[]; involved_products?: string[]; estimated_savings_min?: number | null; estimated_savings_max?: number | null; feedback_classification?: string | null; feedback_reason?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["license_waste_opportunities"]["Insert"]>;
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
      renewal_decision_scenarios: {
        Row: { id: string; organization_id: string; contract_id: string; decision_id: string; scenario_type: string; name: string; current_annual_cost: number | null; annual_cost: number; change_from_current_cost: number | null; estimated_savings: number; one_time_transition_cost: number; net_first_year_effect: number; commitment_years: number; multi_year_committed_cost: number; currency: string; exchange_rate_source: string | null; evidence_refs: Json; evidence_completeness: number; is_preferred: boolean; created_by_user_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; decision_id: string; scenario_type: string; name: string; current_annual_cost?: number | null; annual_cost: number; change_from_current_cost?: number | null; estimated_savings?: number; one_time_transition_cost?: number; net_first_year_effect?: number; commitment_years?: number; multi_year_committed_cost: number; currency: string; exchange_rate_source?: string | null; evidence_refs?: Json; evidence_completeness?: number; is_preferred?: boolean; created_by_user_id?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_decision_scenarios"]["Insert"]>;
        Relationships: [];
      };
      renewal_workspace_tasks: {
        Row: { id: string; organization_id: string; contract_id: string; decision_id: string; owner_user_id: string | null; title: string; due_at: string | null; status: string; priority: string; dependency_task_id: string | null; evidence_requirement: string | null; completion_note: string | null; reminder_id: string | null; created_by_user_id: string | null; completed_by_user_id: string | null; completed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; decision_id: string; owner_user_id?: string | null; title: string; due_at?: string | null; status?: string; priority?: string; dependency_task_id?: string | null; evidence_requirement?: string | null; completion_note?: string | null; reminder_id?: string | null; created_by_user_id?: string | null; completed_by_user_id?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_workspace_tasks"]["Insert"]>;
        Relationships: [];
      };
      renewal_decision_outcomes: {
        Row: { id: string; organization_id: string; contract_id: string; decision_id: string; decision_version: number; selected_decision_type: string; original_cost: number | null; final_agreed_cost: number | null; seats_before: number | null; seats_after: number | null; contract_term_months: number | null; estimated_savings: number | null; realized_savings: number | null; avoided_cost_increase: number | null; currency: string | null; decision_date: string; renewal_completed_at: string; evidence_refs: Json; evidence_completeness: number; confirmed_by_user_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; decision_id: string; decision_version: number; selected_decision_type: string; original_cost?: number | null; final_agreed_cost?: number | null; seats_before?: number | null; seats_after?: number | null; contract_term_months?: number | null; estimated_savings?: number | null; realized_savings?: number | null; avoided_cost_increase?: number | null; currency?: string | null; decision_date: string; renewal_completed_at: string; evidence_refs: Json; evidence_completeness?: number; confirmed_by_user_id?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_decision_outcomes"]["Insert"]>;
        Relationships: [];
      };
      evidence_readiness_assessments: {
        Row: { id: string; organization_id: string; contract_id: string; decision_profile: string; deadline_timezone: string | null; material_evidence_hash: string | null; score: number; readiness_state: string; calculation_version: string; evidence_hash: string; critical_blocker_count: number; missing_count: number; stale_count: number; conflicting_count: number; next_recommended_action: string; calculated_at: string; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; decision_profile: string; deadline_timezone?: string | null; material_evidence_hash?: string | null; score: number; readiness_state: string; calculation_version: string; evidence_hash: string; critical_blocker_count?: number; missing_count?: number; stale_count?: number; conflicting_count?: number; next_recommended_action: string; calculated_at: string; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["evidence_readiness_assessments"]["Insert"]>;
        Relationships: [];
      };
      evidence_readiness_items: {
        Row: { id: string; assessment_id: string; organization_id: string; contract_id: string; requirement_key: string; label: string; category: string; state: string; weight: number; earned_weight: number; is_critical: boolean; evidence_source: string | null; source_record_id: string | null; verified_by_user_id: string | null; verified_at: string | null; freshness_date: string | null; provenance: Json; explanation: string; recommended_action: string; calculation_version: string; created_at: string };
        Insert: { id?: string; assessment_id: string; organization_id: string; contract_id: string; requirement_key: string; label: string; category: string; state: string; weight: number; earned_weight: number; is_critical?: boolean; evidence_source?: string | null; source_record_id?: string | null; verified_by_user_id?: string | null; verified_at?: string | null; freshness_date?: string | null; provenance?: Json; explanation: string; recommended_action: string; calculation_version: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["evidence_readiness_items"]["Insert"]>;
        Relationships: [];
      };
      evidence_readiness_history: {
        Row: { id: string; assessment_id: string; organization_id: string; contract_id: string; decision_profile: string; score: number; readiness_state: string; calculation_version: string; evidence_hash: string; material_evidence_hash: string | null; critical_blocker_count: number; missing_count: number; stale_count: number; conflicting_count: number; changed_requirement_keys: string[]; item_snapshot: Json; recalculation_trigger: string; calculated_at: string; created_at: string };
        Insert: { id?: string; assessment_id: string; organization_id: string; contract_id: string; decision_profile: string; score: number; readiness_state: string; calculation_version: string; evidence_hash: string; material_evidence_hash?: string | null; critical_blocker_count?: number; missing_count?: number; stale_count?: number; conflicting_count?: number; changed_requirement_keys?: string[]; item_snapshot?: Json; recalculation_trigger?: string; calculated_at: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["evidence_readiness_history"]["Insert"]>;
        Relationships: [];
      };
      contract_commercial_baselines: {
        Row: { id: string; organization_id: string; contract_id: string; version: number; source_extraction_run_id: string; source_extraction_run_ids: string[]; source_file_ids: string[]; effective_date: string | null; reviewed_by_user_id: string; reviewed_at: string; calculation_version: string; completeness_status: string; missing_data_warnings: string[]; evidence_field_ids: string[]; evidence_fingerprint: string; terms_snapshot: Json; created_at: string };
        Insert: { id?: string; organization_id: string; contract_id: string; version: number; source_extraction_run_id: string; source_extraction_run_ids: string[]; source_file_ids?: string[]; effective_date?: string | null; reviewed_by_user_id: string; reviewed_at?: string; calculation_version: string; completeness_status: string; missing_data_warnings?: string[]; evidence_field_ids: string[]; evidence_fingerprint: string; terms_snapshot: Json; created_at?: string };
        Update: never;
        Relationships: [];
      };
      contract_commercial_baseline_line_items: {
        Row: { id: string; organization_id: string; contract_id: string; baseline_id: string; line_key: string; product_name: string; sku: string | null; charge_type: string; pricing_model: string; billing_period: string; quantity: number | null; unit_price: number | null; total_amount: number | null; annualized_amount: number; total_commitment_amount: number; currency: string; term_months: number | null; service_period_months: number | null; discount_amount: number | null; discount_percent: number | null; evidence_field_ids: string[]; warning_codes: string[]; created_at: string };
        Insert: Omit<Database["public"]["Tables"]["contract_commercial_baseline_line_items"]["Row"], "id" | "created_at"> & { id?: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      renewal_quote_proposal_versions: {
        Row: { id: string; organization_id: string; contract_id: string; comparison_id: string; quote_file_id: string | null; extraction_run_id: string | null; version: number; document_type: string; review_status: string; terms_snapshot: Json; evidence_field_ids: string[]; evidence_fingerprint: string; missing_data_warnings: string[]; reviewed_by_user_id: string | null; reviewed_at: string | null; created_at: string };
        Insert: Omit<Database["public"]["Tables"]["renewal_quote_proposal_versions"]["Row"], "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_quote_proposal_versions"]["Insert"]>;
        Relationships: [];
      };
      renewal_quote_proposal_line_items: {
        Row: { id: string; organization_id: string; contract_id: string; proposal_version_id: string; line_key: string; product_name: string; sku: string | null; charge_type: string; pricing_model: string; billing_period: string; quantity: number | null; unit_price: number | null; total_amount: number | null; annualized_amount: number; total_commitment_amount: number; currency: string; term_months: number | null; service_period_months: number | null; discount_amount: number | null; discount_percent: number | null; evidence_field_ids: string[]; citations: Json; warning_codes: string[]; created_at: string };
        Insert: Omit<Database["public"]["Tables"]["renewal_quote_proposal_line_items"]["Row"], "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_quote_proposal_line_items"]["Insert"]>;
        Relationships: [];
      };
      renewal_quote_cost_bridges: {
        Row: { id: string; organization_id: string; contract_id: string; comparison_id: string; baseline_id: string; proposal_version_id: string; status: string; currency: string | null; current_annual_cost: number | null; proposed_annual_cost: number | null; attributed_delta: number | null; residual_amount: number | null; components: Json; explanation: string; limitation_codes: string[]; calculation_version: string; evidence_fingerprint: string; created_at: string };
        Insert: Omit<Database["public"]["Tables"]["renewal_quote_cost_bridges"]["Row"], "id" | "created_at"> & { id?: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      renewal_quote_scenarios: {
        Row: { id: string; organization_id: string; contract_id: string; comparison_id: string; scenario_type: string; status: string; annual_cost: number | null; first_year_effect: number | null; multi_year_commitment: number | null; transition_cost: number; estimated_savings_low: number | null; estimated_savings_high: number | null; major_risks: string[]; evidence_fingerprint: string; calculation_version: string; approved_by_user_id: string | null; approved_at: string | null; invalidated_at: string | null; invalidation_reason_code: string | null; created_at: string; updated_at: string };
        Insert: Omit<Database["public"]["Tables"]["renewal_quote_scenarios"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["renewal_quote_scenarios"]["Insert"]>;
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
      create_reviewed_commercial_baseline: {
        Args: { p_organization_id: string; p_contract_id: string; p_source_extraction_run_id: string; p_source_extraction_run_ids: string[]; p_source_file_ids: string[]; p_effective_date: string | null; p_reviewed_by_user_id: string; p_calculation_version: string; p_completeness_status: string; p_missing_data_warnings: string[]; p_evidence_field_ids: string[]; p_evidence_fingerprint: string; p_terms_snapshot: Json; p_line_items: Json };
        Returns: string;
      };
      approve_renewal_decision_version: {
        Args: { p_organization_id: string; p_decision_id: string; p_expected_version: number; p_reviewer_note?: string | null };
        Returns: string;
      };
      select_renewal_decision_scenario: {
        Args: { p_organization_id: string; p_decision_id: string; p_scenario_id: string };
        Returns: string;
      };
      persist_evidence_readiness_assessment: {
        Args: { p_organization_id: string; p_contract_id: string; p_decision_profile: string; p_score: number; p_readiness_state: string; p_calculation_version: string; p_evidence_hash: string; p_next_recommended_action: string; p_calculated_at: string; p_items: Json };
        Returns: Json;
      };
      persist_evidence_readiness_assessment_v2: {
        Args: { p_organization_id: string; p_contract_id: string; p_decision_profile: string; p_score: number; p_readiness_state: string; p_calculation_version: string; p_evidence_hash: string; p_material_evidence_hash: string; p_next_recommended_action: string; p_calculated_at: string; p_items: Json; p_deadline_timezone: string | null; p_recalculation_trigger: string };
        Returns: Json;
      };
      record_renewal_decision_outcome: {
        Args: { p_organization_id: string; p_decision_id: string; p_original_cost: number | null; p_final_agreed_cost: number | null; p_seats_before: number | null; p_seats_after: number | null; p_contract_term_months: number | null; p_estimated_savings: number | null; p_realized_savings: number | null; p_avoided_cost_increase: number | null; p_currency: string | null; p_decision_date: string; p_renewal_completed_at: string; p_evidence_refs: Json };
        Returns: string;
      };
      assign_contract_owner_and_expire_requests: {
        Args: { p_contract_id: string; p_new_owner_user_id?: string | null };
        Returns: Array<{ contract_id: string; organization_id: string; previous_owner_user_id: string | null; new_owner_user_id: string | null; expired_request_ids: string[] | null; expired_count: number | null }>;
      };
      create_renewal_action_request: {
        Args: { p_contract_id: string; p_due_date: string; p_message?: string | null };
        Returns: Array<{ id: string; contract_id: string; organization_id: string; requested_to_user_id: string; request_status: string; requested_action: string; due_date: string | null; due_at: string | null; created: boolean }>;
      };
      create_sample_contract_with_metadata: {
        Args: { p_organization_id: string };
        Returns: string;
      };
      create_subscription_usage_batch_with_rows: {
        Args: { p_organization_id: string; p_source: string; p_status: string; p_file_name: string | null; p_idempotency_key: string | null; p_provider: string | null; p_provider_connection_id: string | null; p_sync_run_id: string | null; p_metadata: Json; p_rows: Json };
        Returns: string;
      };
      create_subscription_usage_consent_attempt: {
        Args: { p_organization_id: string; p_provider: string; p_nonce_hash: string; p_requested_permissions: string[]; p_expires_at: string };
        Returns: string;
      };
      consume_subscription_usage_consent_attempt: {
        Args: { p_organization_id: string; p_provider: string; p_nonce_hash: string };
        Returns: string;
      };
      create_subscription_usage_analysis_scope: {
        Args: { p_organization_id: string; p_current_batch_id: string; p_include_manual_imports?: boolean };
        Returns: Json;
      };
      persist_subscription_usage_analysis_findings: {
        Args: { p_organization_id: string; p_analysis_scope_id: string; p_batch_id: string; p_provider: string; p_provider_connection_id: string; p_sync_run_id: string; p_findings: Json };
        Returns: number;
      };
      begin_manual_subscription_usage_sync_attempt: {
        Args: { p_organization_id: string; p_connection_id: string; p_provider: string; p_logical_interval_key: string; p_retry_failed?: boolean };
        Returns: Json;
      };
      transition_manual_subscription_usage_sync_attempt: {
        Args: { p_organization_id: string; p_sync_run_id: string; p_next_stage: string; p_usage_import_batch_id?: string | null; p_row_count?: number | null; p_finding_count?: number | null; p_final_status?: string | null; p_failure_code?: string | null; p_retry_after?: string | null };
        Returns: Json;
      };
      disconnect_subscription_usage_provider: {
        Args: { p_organization_id: string; p_connection_id: string };
        Returns: number;
      };
      cleanup_subscription_usage_consent_attempts: {
        Args: { p_consumed_retention_days?: number; p_limit?: number };
        Returns: number;
      };
      claim_due_subscription_usage_connections: {
        Args: { p_limit: number; p_lease_minutes: number; p_worker_token: string };
        Returns: Database["public"]["Tables"]["subscription_usage_provider_connections"]["Row"][];
      };
      create_scheduled_subscription_usage_batch_with_rows: {
        Args: { p_organization_id: string; p_source: string; p_status: string; p_idempotency_key: string; p_provider: string; p_provider_connection_id: string; p_sync_run_id: string; p_metadata: Json; p_rows: Json };
        Returns: string;
      };
      disconnect_google_workspace_subscription_usage_connection: {
        Args: { p_organization_id: string; p_connection_id: string };
        Returns: boolean;
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
