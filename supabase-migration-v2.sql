-- ==========================================================================
-- Migração v2:
--  1) Contas ocultas manualmente do dashboard (ad_accounts.hidden)
--  2) Períodos extras nos snapshots (last_14d/prev_14d/last_30d/prev_30d)
--     -> não precisa de DDL: a coluna "period" já é texto livre.
-- Rode UMA VEZ no SQL Editor do Supabase. Aditivo e idempotente.
-- ==========================================================================

alter table ad_accounts add column if not exists hidden boolean not null default false;

-- Índice para o "period" ajudar as leituras por janela (7d/14d/30d).
create index if not exists idx_snap_account_period on metric_snapshots(account_id, period, captured_at desc);
