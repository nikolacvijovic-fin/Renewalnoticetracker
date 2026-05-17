alter table public.contract_metadata
  add column if not exists contract_value_amount numeric,
  add column if not exists contract_value_currency text,
  add column if not exists contract_value_period text,
  add column if not exists price_change_trigger text,
  add column if not exists payment_trigger text,
  add column if not exists financial_data_trust_status text;
