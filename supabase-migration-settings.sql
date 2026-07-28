-- supabase-migration-settings.sql
-- Configurações do sistema editáveis pela tela de Config.
--
-- Antes disto, nome da marca e endereços de e-mail viviam só em variável de
-- ambiente: trocar o remetente exigia redeploy. As chaves de API continuam no
-- ambiente de propósito — segredo não entra em tabela lida pelo painel.
--
-- Chaves usadas hoje (ver lib/settings.ts):
--   brand_name, brand_description,
--   report_from_email, report_reply_to, report_test_email, task_alert_email
-- Chave ausente ou vazia cai na variável de ambiente correspondente.

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- Só o service role escreve; o painel passa pelas rotas /api/settings.
drop policy if exists app_settings_service_only on app_settings;
create policy app_settings_service_only on app_settings
  for all using (false) with check (false);

comment on table app_settings is 'Configurações do sistema editáveis no painel. Vazio = valor da variável de ambiente.';
