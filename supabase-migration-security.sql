-- ==========================================================================
-- Blindagem do banco do AdsCtrl
--
-- O dashboard acessa o Supabase exclusivamente pelo servidor, usando a
-- service role. Ativar RLS sem políticas públicas impede que anon/authenticated
-- consultem ou alterem os dados diretamente pela API pública do Supabase.
--
-- Esta migração não remove dados e pode ser executada mais de uma vez.
-- ==========================================================================

alter table if exists public.client_groups enable row level security;
alter table if exists public.ad_accounts enable row level security;
alter table if exists public.metric_snapshots enable row level security;
alter table if exists public.alerts enable row level security;
alter table if exists public.clients enable row level security;
alter table if exists public.client_ad_accounts enable row level security;
alter table if exists public.daily_account_metrics enable row level security;
alter table if exists public.collection_runs enable row level security;
alter table if exists public.collection_account_runs enable row level security;

