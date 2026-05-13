alter table organizations
  add column if not exists billing_provider text,
  add column if not exists billing_customer_id text unique,
  add column if not exists billing_subscription_id text unique,
  add column if not exists billing_plan_code text,
  add column if not exists billing_price_id text,
  add column if not exists billing_subscription_status text,
  add column if not exists billing_current_period_end timestamptz;

update organizations
set
  billing_provider = coalesce(
    billing_provider,
    case
      when stripe_customer_id is not null or stripe_subscription_id is not null then 'stripe'
      else null
    end
  ),
  billing_customer_id = coalesce(billing_customer_id, stripe_customer_id),
  billing_subscription_id = coalesce(billing_subscription_id, stripe_subscription_id),
  billing_plan_code = coalesce(billing_plan_code, stripe_price_id),
  billing_price_id = coalesce(billing_price_id, stripe_price_id),
  billing_subscription_status = coalesce(billing_subscription_status, subscription_status),
  billing_current_period_end = coalesce(billing_current_period_end, subscription_current_period_end);
