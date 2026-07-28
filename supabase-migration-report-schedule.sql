-- supabase-migration-report-schedule.sql
-- Em que dia o relatório semanal sai, por cliente.
--
-- Antes disto o dia era o do cron (segunda, igual para todo mundo). Cliente que
-- fecha a semana na sexta e cliente que só olha número na quarta recebiam junto.
-- A coluna guarda o dia avaliado no fuso do próprio cliente (clients.timezone).
--
-- report_weekday: 0 = domingo … 6 = sábado. Padrão 1 (segunda), que é o que o
-- cron já fazia — nenhum cliente muda de comportamento ao rodar esta migração.
--
-- O HORÁRIO não está aqui de propósito: é um só para todos, gravado em
-- app_settings.report_hour (Config › Envio) e aplicado na manhã de cada fuso.
-- Se você rodou uma versão anterior deste arquivo, a coluna clients.report_hour
-- pode existir; ela ficou sem uso e pode ser removida à vontade.

alter table clients add column if not exists report_weekday smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_report_weekday_range') then
    alter table clients add constraint clients_report_weekday_range
      check (report_weekday between 0 and 6);
  end if;
end $$;

comment on column clients.report_weekday is 'Dia da semana do envio do relatório (0=domingo). Avaliado no fuso do cliente.';
