-- ==========================================================================
-- Migração: alertas com "ciente" (acknowledged) + histórico.
-- Rode isto UMA VEZ no SQL Editor do Supabase (projeto qsgyqzagqlwojboucwdc).
-- É aditivo e idempotente (pode rodar de novo sem quebrar).
-- ==========================================================================

alter table alerts add column if not exists fingerprint text;
alter table alerts add column if not exists acknowledged boolean not null default false;
alter table alerts add column if not exists acknowledged_at timestamptz;
alter table alerts add column if not exists resolved_at timestamptz;
alter table alerts add column if not exists first_seen_at timestamptz default now();
alter table alerts add column if not exists last_seen_at timestamptz default now();

-- Alertas antigos não têm fingerprint; serão regerados na próxima coleta.
delete from alerts where fingerprint is null;

-- Identidade estável por conta+tipo: permite upsert e preserva o "ciente".
create unique index if not exists uq_alerts_fingerprint on alerts(fingerprint);

-- Índice para separar ativos de histórico rapidamente.
create index if not exists idx_alerts_state on alerts(resolved, acknowledged);
