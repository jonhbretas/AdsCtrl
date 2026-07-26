-- ==========================================================================
-- Migração: marca por cliente no que ele VÊ.
--
-- O painel interno é Ectolab; a entrega ao cliente é Assertivus. Esta coluna
-- existe para o dia em que uma conta precisar de outra assinatura — cliente
-- que exige marca própria, ou uma segunda marca da agência — sem que isso
-- vire um "se" espalhado pelo código.
--
-- Vazio = Assertivus, que é o padrão de hoje. Só o relatório, o painel do
-- cliente e o e-mail semanal leem este campo.
--
-- Aditiva e idempotente.
-- ==========================================================================

alter table clients add column if not exists brand_name text;

comment on column clients.brand_name is
  'Marca exibida no relatório, no painel do cliente e no e-mail semanal. Nulo = Assertivus.';
