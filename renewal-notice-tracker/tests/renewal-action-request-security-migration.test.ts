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
});
