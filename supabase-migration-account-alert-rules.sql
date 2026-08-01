-- supabase-migration-account-alert-rules.sql
-- Rode no SQL Editor do Supabase.
-- Alertas por CONTA DE ANÚNCIOS (cada plataforma tem as suas — Meta e Google
-- são mundos diferentes): regras configuráveis (custo de lead, regiões que
-- precisam receber tráfego, frescor de criativos, revisão mensal da
-- estratégia) e os alertas gerados por elas. A coleta avalia as regras; o
-- resultado vive em account_alerts com unique(rule_id) — uma linha por regra,
-- resolvida quando a condição passa.

create table if not exists account_alert_rules (
  id uuid primary key default gen_random_uuid(),
  account_id text references ad_accounts(account_id) on delete cascade,
  kind text not null check (kind in ('cpl', 'region', 'creative_age', 'strategy_review')),
  name text not null,
  config jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_account_alert_rules_account on account_alert_rules(account_id);

create table if not exists account_alerts (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid unique references account_alert_rules(id) on delete cascade,
  account_id text references ad_accounts(account_id) on delete cascade,
  kind text not null,
  level text not null default 'warning',
  title text not null,
  detail text not null,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  resolved boolean not null default false,
  resolved_at timestamptz
);

create index if not exists idx_account_alerts_account on account_alerts(account_id, resolved);

-- Resumo estratégico da conta: o "caderno" do que precisa estar alinhado todo
-- mês (público alvo, regiões, cidades, melhores ofertas, objetivo). Uma linha
-- por conta; a regra strategy_review avisa quando passa do prazo sem atualizar.
create table if not exists account_strategies (
  account_id text primary key references ad_accounts(account_id) on delete cascade,
  content jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
