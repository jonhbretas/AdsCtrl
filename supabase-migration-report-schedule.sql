-- supabase-migration-report-schedule.sql
-- Quando o relatório semanal sai, por cliente.
--
-- Antes disto o horário era o do cron (segunda 11h UTC, igual para todo mundo).
-- Cliente que lê e-mail cedo e cliente que só abre à tarde recebiam junto, e
-- não havia como combinar "todo dia 1º" com quem pediu isso. As duas colunas
-- guardam a combinação no fuso do próprio cliente (clients.timezone).
--
-- report_weekday: 0 = domingo … 6 = sábado. Padrão 1 (segunda), que é o que o
-- cron já fazia — nenhum cliente muda de comportamento ao rodar esta migração.
-- report_hour: 0–23, hora cheia no fuso do cliente. Padrão 11.

alter table clients add column if not exists report_weekday smallint not null default 1;
alter table clients add column if not exists report_hour smallint not null default 11;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_report_weekday_range') then
    alter table clients add constraint clients_report_weekday_range
      check (report_weekday between 0 and 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_report_hour_range') then
    alter table clients add constraint clients_report_hour_range
      check (report_hour between 0 and 23);
  end if;
end $$;

comment on column clients.report_weekday is 'Dia da semana do envio do relatório (0=domingo). Avaliado no fuso do cliente.';
comment on column clients.report_hour is 'Hora cheia do envio do relatório (0-23). Avaliado no fuso do cliente.';
