alter table public.users
  add column if not exists monthly_digest_enabled boolean not null default true;

alter table public.organizations
  add column if not exists billing_email text,
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists stripe_price_id text,
  add column if not exists plan_tier text not null default 'free',
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists subscription_current_period_end timestamptz;

alter table public.organizations
  add constraint organizations_plan_tier_check
  check (plan_tier in ('free', 'starter', 'growth'));

alter table public.organizations
  add constraint organizations_subscription_status_check
  check (subscription_status in ('inactive', 'trialing', 'active', 'past_due', 'cancelled'));

alter table public.contracts
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null,
  add column if not exists department text,
  add column if not exists status_tag text not null default 'active';

alter table public.contracts
  add constraint contracts_status_tag_check
  check (status_tag in ('draft', 'in_review', 'approved', 'active', 'renewal_watch', 'terminated'));

alter table public.reminders
  add column if not exists recipient_emails jsonb not null default '[]'::jsonb;

update public.reminders
set recipient_emails = case
  when recipient_email is not null and recipient_email <> '' then jsonb_build_array(lower(recipient_email))
  else '[]'::jsonb
end
where recipient_emails = '[]'::jsonb;

alter table public.notification_logs
  alter column reminder_id drop not null;

alter table public.notification_logs
  add column if not exists notification_kind text not null default 'reminder';

alter table public.notification_logs
  add constraint notification_logs_notification_kind_check
  check (notification_kind in ('reminder', 'monthly_digest', 'billing'));

alter table public.audit_logs
  add column if not exists entity_type text not null default 'contract',
  add column if not exists entity_id uuid;

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  export_type text not null check (export_type in ('csv', 'xlsx')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.exports enable row level security;

create policy "members can read exports" on public.exports
for select using (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = exports.organization_id
      and memberships.user_id = auth.uid()
  )
);

create policy "members can create exports" on public.exports
for insert with check (
  exists (
    select 1 from public.memberships
    where memberships.organization_id = exports.organization_id
      and memberships.user_id = auth.uid()
  )
);
