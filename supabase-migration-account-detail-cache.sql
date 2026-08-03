-- Cache do detalhe ao vivo da conta (tela de Campanhas).
-- Sem cache, cada abertura da tela dispara ~20 chamadas às APIs da Meta/Google
-- (KPIs, níveis, breakdowns, status, thumbs...) — o caminho mais curto para
-- tomar rate limit (code 17) e queimar a cota horária. Aqui o payload inteiro
-- do /api/account/detail é guardado por conta+período: período fechado vale
-- 24h (dados do mês passado não mudam mais) e período que inclui hoje vale
-- 15min. O botão "Atualizar" ignora o cache (?fresh=1).
-- Migração aditiva/idempotente.

create table if not exists account_detail_cache (
  account_id text not null,
  range_since date not null,
  range_until date not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  hits integer not null default 0,
  primary key (account_id, range_since, range_until)
);

create index if not exists idx_account_detail_cache_fetched
  on account_detail_cache(fetched_at desc);
