-- supabase-schema.sql
-- Rode isto no SQL Editor do Supabase.

-- Grupos de clientes (você agrupa as contas como quiser)
create table if not exists client_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text default '#3987e5',
  created_at timestamptz default now()
);

-- Contas de anúncio (espelho local das contas da Meta)
create table if not exists ad_accounts (
  account_id text primary key,           -- ex: 549703913801717
  name text not null,
  platform text default 'meta',          -- meta | google (futuro)
  currency text default 'BRL',
  group_id uuid references client_groups(id) on delete set null,
  status text,                           -- ACTIVE, DISABLED, UNSETTLED...
  balance numeric,                       -- saldo restante (se prepaid)
  spend_cap numeric,
  updated_at timestamptz default now()
);

-- Snapshots de métricas por conta (histórico para comparar quedas)
create table if not exists metric_snapshots (
  id bigint generated always as identity primary key,
  account_id text references ad_accounts(account_id) on delete cascade,
  captured_at timestamptz default now(),
  period text,                           -- 'last_7d', 'prev_7d', etc
  spend numeric default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  ctr numeric default 0,
  cpc numeric default 0,
  conversions numeric default 0
);

-- Alertas gerados na última coleta
create table if not exists alerts (
  id bigint generated always as identity primary key,
  account_id text references ad_accounts(account_id) on delete cascade,
  account_name text,
  level text,                            -- critical | warning | info
  type text,
  title text,
  detail text,
  created_at timestamptz default now(),
  resolved boolean default false
);

-- Índices úteis
create index if not exists idx_snap_account on metric_snapshots(account_id, captured_at desc);
create index if not exists idx_alerts_level on alerts(level, resolved);
create index if not exists idx_accounts_group on ad_accounts(group_id);
