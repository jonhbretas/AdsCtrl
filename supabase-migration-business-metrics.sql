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

-- Campo vazio significa "não informado"; não deve aparecer como zero no painel.
alter table business_metric_snapshots
  alter column active_clients drop not null,
  alter column new_clients drop not null,
  alter column mrr drop not null,
  alter column new_mrr drop not null,
  alter column investment drop not null,
  alter column cac drop not null,
  alter column revenue drop not null,
  alter column expenses drop not null,
  alter column net_profit drop not null,
  alter column renewal_rate drop not null,
  alter column variable_revenue drop not null,
  alter column churned_clients drop not null,
  alter column lost_mrr drop not null,
  alter column delinquency_amount drop not null,
  alter column warning_clients drop not null,
  alter column ltv drop not null,
  alter column avg_retention_months drop not null,
  alter column avg_time_to_churn_months drop not null;
