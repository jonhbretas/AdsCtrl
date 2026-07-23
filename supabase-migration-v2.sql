-- ==========================================================================
-- Migração v2:
--  1) Contas ocultas manualmente do dashboard (ad_accounts.hidden)
--  2) Períodos extras nos snapshots (last_14d/prev_14d/last_30d/prev_30d)
--     -> não precisa de DDL: a coluna "period" já é texto livre.
-- Rode UMA VEZ no SQL Editor do Supabase. Aditivo e idempotente.
-- ==========================================================================

alter table ad_accounts add column if not exists hidden boolean not null default false;

-- Multi-token: índice do token (System User/BM) que enxerga a conta.
-- 0 = token primário (META_ACCESS_TOKEN). Usado para consultar cada conta
-- com o token certo no drill-down/overview ao vivo.
alter table ad_accounts add column if not exists token_ref smallint not null default 0;

-- Índice para o "period" ajudar as leituras por janela (7d/14d/30d).
create index if not exists idx_snap_account_period on metric_snapshots(account_id, period, captured_at desc);

-- Compras (quantidade) e valor de compra (receita) por snapshot, p/ ROAS.
alter table metric_snapshots add column if not exists purchases numeric default 0;
alter table metric_snapshots add column if not exists purchase_value numeric default 0;
