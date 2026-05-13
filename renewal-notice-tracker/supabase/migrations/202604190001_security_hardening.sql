create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  organization_id uuid null,
  event_type text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  status text not null default 'received',
  error_message text null
);

create unique index if not exists billing_webhook_events_provider_event_key_idx
  on public.billing_webhook_events(provider, event_key);

create index if not exists billing_webhook_events_organization_id_idx
  on public.billing_webhook_events(organization_id);
