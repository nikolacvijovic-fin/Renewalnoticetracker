alter table public.memberships
  drop constraint if exists memberships_role_check;

alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'member'));

alter table public.organizations
  add column if not exists slack_webhook_url text,
  add column if not exists slack_channel text,
  add column if not exists slack_fallback_channel text,
  add column if not exists teams_webhook_url text,
  add column if not exists teams_fallback_channel text;

alter table public.reminders
  alter column status drop default;

alter table public.reminders
  drop constraint if exists reminders_status_check;

alter table public.reminders
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 4,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token text;

alter table public.reminders
  alter column status set default 'pending';

alter table public.reminders
  add constraint reminders_status_check
  check (status in ('pending', 'processing', 'retry_pending', 'sent', 'failed_terminal', 'cancelled'));

update public.reminders
set next_retry_at = remind_at
where next_retry_at is null;

alter table public.notification_logs
  add column if not exists destination text,
  add column if not exists delivery_key text,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb;

create unique index if not exists notification_logs_delivery_key_key
  on public.notification_logs (delivery_key)
  where delivery_key is not null;
