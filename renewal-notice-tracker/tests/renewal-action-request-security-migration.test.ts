import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readMigration() {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "202608090001_renewal_action_request_security.sql"
    ),
    "utf8"
  );
}

function readOutboxMigration() {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "202608090002_renewal_action_request_outbox.sql"
    ),
    "utf8"
  );
}

function readRetryHardeningMigration() {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "202608110001_secure_sample_rpc_and_outbox_retries.sql"
    ),
    "utf8"
  );
}

function readProtectedPayloadMigration() {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "202608110002_protected_renewal_action_notification_payloads.sql"
    ),
    "utf8"
  );
}

function readProtectedPayloadRepository() {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      "lib",
      "notifications",
      "repositories",
      "admin-renewal-action-notification-payloads-repository.ts"
    ),
    "utf8"
  );
}

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("renewal action request security migration", () => {
  it("adds tenant and relational integrity constraints", () => {
    const migration = readMigration();

    expect(migration).toContain("add column if not exists due_date date");
    expect(migration).toContain("contracts_organization_id_id_key unique (organization_id, id)");
    expect(migration).toContain("renewal_action_requests_contract_org_fkey");
    expect(migration).toContain("foreign key (organization_id, contract_id)");
    expect(migration).toContain("references public.contracts (organization_id, id)");
    expect(migration).toContain("renewal_action_requests_assignee_membership_fkey");
    expect(migration).toContain("foreign key (organization_id, requested_to_user_id)");
    expect(migration).toContain("references public.memberships (organization_id, user_id)");
    expect(migration).toContain("renewal_action_requests_due_date_required_check");
  });

  it("prevents duplicate active decide-renewal requests", () => {
    const migration = readMigration();

    expect(migration).toContain("renewal_action_requests_one_pending_decide_idx");
    expect(migration).toContain("where request_status = 'pending'");
    expect(migration).toContain("and requested_action = 'decide_renewal'");
  });

  it("removes broad direct writes and exposes narrow RPC transitions", () => {
    const migration = readMigration();

    expect(migration).toContain(
      'drop policy if exists "operators can create renewal action requests"'
    );
    expect(migration).toContain(
      'drop policy if exists "operators and assigned owners can update renewal action requests"'
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("create_renewal_action_request");
    expect(migration).toContain("respond_renewal_action_request");
    expect(migration).toContain("expire_renewal_action_request");
    expect(migration).toContain("assign_contract_owner_and_expire_requests");
    expect(migration).toContain("grant execute on function public.create_renewal_action_request");
    expect(migration).not.toContain("for all");
    expect(migration).not.toContain("for delete");
  });

  it("enforces pending-only transitions and immutable workflow fields", () => {
    const migration = readMigration();

    expect(migration).toContain("and rar.request_status = 'pending'");
    expect(migration).toContain("p_target_status not in ('completed', 'dismissed')");
    expect(migration).toContain("v_request.requested_to_user_id = v_actor");
    expect(migration).toContain("v_role in ('owner', 'admin', 'operator')");
    expect(migration).toContain("p_due_date > v_contract.notice_deadline_date");
    expect(migration).not.toMatch(/set\s+organization_id/i);
    expect(migration).not.toMatch(/set\s+contract_id/i);
    expect(migration).not.toMatch(/set\s+requested_to_user_id/i);
  });

  it("expires previous-owner pending requests during owner reassignment", () => {
    const migration = readMigration();

    expect(migration).toContain("for update");
    expect(migration).toContain("set owner_user_id = p_new_owner_user_id");
    expect(migration).toContain("rar.request_status = 'pending'");
    expect(migration).toContain("rar.requested_action = 'decide_renewal'");
    expect(migration).toContain("rar.requested_to_user_id = previous_owner_user_id");
    expect(migration).toContain("expired_request_ids");
    expect(migration).toContain("expired_count");
  });

  it("queues renewal action request notifications through the request RPC", () => {
    const migration = readOutboxMigration();

    expect(migration).toContain("'renewal_action_request'");
    expect(migration).toContain("insert into public.notification_logs");
    expect(migration).toContain("'queued'");
    expect(migration).toContain("'renewal_action_request:' || id::text || ':email'");
    expect(migration).toContain("on conflict (delivery_key) where delivery_key is not null do nothing");
    expect(migration).toContain("'internal_owner_action_request'");
    expect(migration).not.toMatch(/vendor_contact|raw_contract|private_note|contract_text|secret|token/i);
  });

  it("allows the single late-activation reminder type without opening external delivery", () => {
    const migration = readOutboxMigration();

    expect(migration).toContain("'late_activation_action_required'");
    expect(migration).toContain("reminders_reminder_type_check");
    expect(migration).not.toMatch(/slack|teams|crm|vendor|counterparty/i);
  });

  it("adds bounded retry and stale-claim state to the renewal-action notification outbox", () => {
    const migration = readRetryHardeningMigration();

    expect(migration).toContain("add column if not exists attempt_count integer not null default 0");
    expect(migration).toContain("add column if not exists max_attempts integer not null default 4");
    expect(migration).toContain("add column if not exists next_retry_at timestamptz");
    expect(migration).toContain("add column if not exists processing_started_at timestamptz");
    expect(migration).toContain("add column if not exists processing_token text");
    expect(migration).toContain("add column if not exists last_attempt_at timestamptz");
    expect(migration).toContain("idx_notification_logs_renewal_action_outbox_due");
    expect(migration).toContain("where notification_kind = 'renewal_action_request'");
    expect(migration).not.toMatch(/recipient_email\s*=|message_body|provider_payload.*raw_contract|secret token/i);
  });

  it("stores renewal-action delivery payloads behind a service-role-only protected table", () => {
    const migration = readProtectedPayloadMigration();

    expect(migration).toContain("create table if not exists public.renewal_action_notification_payloads");
    expect(migration).toContain("alter table public.renewal_action_notification_payloads enable row level security");
    expect(migration).toContain('create policy "deny customer reads for renewal action notification payloads"');
    expect(migration).toContain("using (false)");
    expect(migration).toContain("with check (false)");
    expect(migration).toContain("revoke all on table public.renewal_action_notification_payloads from public");
    expect(migration).toContain("revoke all on table public.renewal_action_notification_payloads from anon");
    expect(migration).toContain("revoke all on table public.renewal_action_notification_payloads from authenticated");
    expect(migration).toContain("foreign key (notification_log_id, organization_id)");
    expect(migration).toContain("foreign key (request_id, organization_id)");
    expect(migration).toContain("foreign key (contract_id, organization_id)");
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete|all).*renewal_action_notification_payloads/i);
  });

  it("moves legacy full email snapshots out of operational notification logs", () => {
    const migration = readProtectedPayloadMigration();

    expect(migration).toContain("insert into public.renewal_action_notification_payloads");
    expect(migration).toContain("'legacy_provider_request'");
    expect(migration).toContain("providerRequest");
    expect(migration).toContain("recipient_email = 'protected-recipient@noticecontrol.internal'");
    expect(migration).toContain("'delivery_payload_ref', p.id");
    expect(migration).toContain("'payload_template_version', p.template_version");
    expect(migration).toContain("'payload_fingerprint', p.payload_fingerprint");
    expect(migration).toContain("nl.provider_payload ? 'email_delivery_snapshot'");
  });

  it("queues new renewal-action notifications without recipient PII or email request bodies in notification_logs", () => {
    const migration = readProtectedPayloadMigration();
    const rpcBody = migration.slice(
      migration.indexOf("create or replace function public.create_renewal_action_request")
    );

    expect(rpcBody).toContain("'protected-recipient@noticecontrol.internal'");
    expect(rpcBody).toContain("'delivery_payload_state', 'pending_protected_payload'");
    expect(rpcBody).not.toContain("'email_delivery_snapshot'");
    expect(rpcBody).not.toMatch(/provider_payload[^\n]+owner_notification_email/i);
    expect(rpcBody).not.toMatch(/provider_payload[^\n]+v_recipient_email/i);
  });

  it("limits protected payload cleanup to terminal or sent renewal-action notification rows", () => {
    const repository = readProtectedPayloadRepository();

    expect(repository).toContain('notification_logs!inner');
    expect(repository).toContain('.eq("notification_logs.notification_kind", "renewal_action_request")');
    expect(repository).toContain('.in("notification_logs.status", ["sent", "failed_terminal", "skipped"])');
    expect(repository).toContain(".limit(Math.min(Math.max(input.limit, 1), 100))");
    expect(repository).not.toContain(".select(\"*\")");
  });

  it("keeps beta health and customer export surfaces away from protected delivery payloads", () => {
    const betaHealthPage = readSource("app/admin/beta-health/page.tsx");
    const customerExportCenter = readSource("lib/exports/customer-export-center.ts");
    const customerExportRoute = readSource("lib/exports/customer-export-route.ts");

    expect(betaHealthPage).not.toContain("renewal_action_notification_payloads");
    expect(customerExportCenter).not.toContain("renewal_action_notification_payloads");
    expect(customerExportRoute).not.toContain("renewal_action_notification_payloads");
  });
});
