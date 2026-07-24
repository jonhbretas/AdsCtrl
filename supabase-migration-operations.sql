-- Fundação operacional do AdsCtrl: fatos diários e observabilidade da coleta.
-- Migração aditiva/idempotente. Não remove dados existentes.

create table if not exists daily_account_metrics (
  account_id text not null references ad_accounts(account_id) on delete cascade,
  metric_date date not null,
  platform text not null,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric not null default 0,
  conversion_value numeric not null default 0,
  results jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  primary key (account_id, metric_date)
);

create index if not exists idx_daily_metrics_date
  on daily_account_metrics(metric_date desc);

create table if not exists collection_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger_source text not null default 'manual',
  status text not null default 'running',
  selected_accounts integer not null default 0,
  processed_accounts integer not null default 0,
  failed_accounts integer not null default 0,
  error text
);

create table if not exists collection_account_runs (
  id bigint generated always as identity primary key,
  run_id bigint references collection_runs(id) on delete cascade,
  account_id text references ad_accounts(account_id) on delete cascade,
  platform text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  error text
);

create index if not exists idx_collection_account_run
  on collection_account_runs(account_id, started_at desc);
