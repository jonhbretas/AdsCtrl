-- Fundação da operação assistida: decisões, limites e funil consolidado.
create table if not exists optimization_decisions (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  client_id uuid references clients(id) on delete set null,
  account_id text,
  action_type text not null,
  title text not null,
  rationale text,
  impact_label text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','scheduled','executed')),
  scheduled_for timestamptz,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_optimization_decisions_status on optimization_decisions(status, created_at desc);
create index if not exists idx_optimization_decisions_client on optimization_decisions(client_id, created_at desc);

alter table clients add column if not exists target_roas numeric(10,2);
alter table clients add column if not exists max_cpa numeric(14,2);
alter table clients add column if not exists max_daily_spend numeric(14,2);
alter table clients add column if not exists max_budget_change_percent numeric(7,2) not null default 20;
alter table clients add column if not exists automation_mode text not null default 'approval' check (automation_mode in ('observe','approval','autonomous'));

create table if not exists client_funnel_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  impressions numeric not null default 0,
  clicks numeric not null default 0,
  landing_page_views numeric not null default 0,
  leads numeric not null default 0,
  checkouts numeric not null default 0,
  purchases numeric not null default 0,
  purchase_value numeric not null default 0,
  source text not null default 'ads',
  created_at timestamptz not null default now(),
  unique(client_id, period_start, period_end, source)
);
