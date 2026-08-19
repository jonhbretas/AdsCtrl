-- Relatório financeiro mensal por e-mail (último dia do mês, junto da coleta).
-- Migração aditiva/idempotente. Rode UMA VEZ no SQL Editor do Supabase.

-- Histórico de envios: trava contra duplicado (a coleta roda todo dia e só o
-- último dia do mês deve disparar) e registro do que foi mandado para quem.
create table if not exists finance_digest_sends (
  id bigint generated always as identity primary key,
  period text not null,                 -- 'YYYY-MM' do mês coberto pelo relatório
  trigger text not null default 'auto', -- auto (fim da coleta) | manual (painel)
  recipient text,
  status text not null default 'sent',  -- sent | skipped | error
  reason text,                          -- motivo do skip/erro
  provider_message_id text,
  dry_run boolean not null default false,
  created_at timestamptz not null default now()
);

-- Um envio automático por mês. Manual (botão do painel) e testes não travam.
create unique index if not exists uq_finance_digest_sends_period
  on finance_digest_sends(period, trigger)
  where status = 'sent' and dry_run = false;

create index if not exists idx_finance_digest_sends_created
  on finance_digest_sends(created_at desc);
