alter table public.reminders
  add column if not exists delivery_key text;

create unique index if not exists reminders_active_delivery_key_idx
  on public.reminders (organization_id, delivery_key)
  where delivery_key is not null
    and status in ('pending', 'processing', 'retry_pending', 'sent');
