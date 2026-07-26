-- Relatório semanal por e-mail (Resend).
-- Migração aditiva/idempotente. Rode UMA VEZ no SQL Editor do Supabase.

-- Contato e opt-in por cliente. O envio é desligado por padrão: nenhum
-- cliente recebe e-mail sem alguém marcar explicitamente.
alter table clients add column if not exists report_email text;
alter table clients add column if not exists report_enabled boolean not null default false;
alter table clients add column if not exists report_last_sent_at timestamptz;

-- Histórico de envios: serve de trava contra disparo duplicado (o cron pode
-- reexecutar) e de registro do que foi mandado para quem.
create table if not exists report_sends (
  id bigint generated always as identity primary key,
  client_id uuid references clients(id) on delete cascade,
  account_id text,
  range_since date not null,
  range_until date not null,
  recipient text,
  status text not null default 'sent',        -- sent | skipped | error
  reason text,                                -- motivo do skip/erro
  provider_message_id text,
  dry_run boolean not null default false,
  created_at timestamptz not null default now()
);

-- Um envio real por cliente e por período. Testes (dry_run) não travam.
create unique index if not exists uq_report_sends_period
  on report_sends(client_id, range_since, range_until)
  where status = 'sent' and dry_run = false;

create index if not exists idx_report_sends_client
  on report_sends(client_id, created_at desc);
