-- Cache do relatório: o painel do cliente fica aberto num link permanente,
-- e sem cache cada recarga viraria dezenas de chamadas às APIs da Meta e do
-- Google — o caminho mais curto para tomar throttling e queimar cota.
-- Migração aditiva/idempotente.

create table if not exists report_cache (
  account_id text not null,
  range_since date not null,
  range_until date not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  hits integer not null default 0,
  primary key (account_id, range_since, range_until)
);

create index if not exists idx_report_cache_fetched
  on report_cache(fetched_at desc);
