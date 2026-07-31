-- Histórico mensal da visão estratégica da agência.
-- Os valores calculados hoje podem ser gravados aqui para formar as tendências.

create table if not exists business_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  active_clients integer not null default 0,
  new_clients integer not null default 0,
  mrr numeric(14,2) not null default 0,
  new_mrr numeric(14,2) not null default 0,
  investment numeric(14,2) not null default 0,
  cac numeric(14,2) not null default 0,
  revenue numeric(14,2) not null default 0,
  expenses numeric(14,2) not null default 0,
  net_profit numeric(14,2) not null default 0,
  renewal_rate numeric(7,2) not null default 0,
  variable_revenue numeric(14,2) not null default 0,
  churned_clients integer not null default 0,
  lost_mrr numeric(14,2) not null default 0,
  delinquency_amount numeric(14,2) not null default 0,
  warning_clients integer not null default 0,
  ltv numeric(14,2) not null default 0,
  avg_retention_months numeric(8,2) not null default 0,
  avg_time_to_churn_months numeric(8,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month)
);

create index if not exists idx_business_metric_snapshots_month on business_metric_snapshots(month desc);
