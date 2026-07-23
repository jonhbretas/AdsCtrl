-- ==========================================================================
-- Migração: série diária (sparkline) no snapshot de métricas.
-- Rode UMA VEZ no SQL Editor do Supabase. Aditivo e idempotente.
-- ==========================================================================

alter table metric_snapshots add column if not exists daily jsonb;
