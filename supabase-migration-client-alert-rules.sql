-- supabase-migration-client-alert-rules.sql
-- Rode no SQL Editor do Supabase.
-- Alertas por CLIENTE: regras configuráveis (custo de lead, regiões que
-- precisam receber tráfego, frescor de criativos) e os alertas gerados por
-- elas. A coleta avalia as regras; o resultado vive em client_alerts com
-- unique(rule_id) — uma linha por regra, resolvida quando a condição passa.

create table if not exists client_alert_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  kind text not null check (kind in ('cpl', 'region', 'creative_age')),
  name text not null,
  config jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_client_alert_rules_client on client_alert_rules(client_id);

create table if not exists client_alerts (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid unique references client_alert_rules(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  kind text not null,
  level text not null default 'warning',
  title text not null,
  detail text not null,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  resolved boolean not null default false,
  resolved_at timestamptz
);

create index if not exists idx_client_alerts_client on client_alerts(client_id, resolved);
