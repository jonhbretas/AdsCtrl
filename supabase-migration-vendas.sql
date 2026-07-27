-- supabase-migration-vendas.sql
-- Vendas REAIS informadas à mão, por cliente e por mês.
--
-- Por que existe: a plataforma reporta conversão, não venda. Em campanha de
-- mensagem o pedido fecha no WhatsApp e nunca volta para o Meta; em conta de
-- serviço o fechamento é por telefone. Sem este número, "como anda o cliente"
-- é sempre uma inferência. Aqui o valor é digitado por quem sabe.
--
-- O mês é guardado como o PRIMEIRO DIA do mês (2026-07-01), não como texto:
-- assim ordena, compara e filtra por intervalo sem conversão nenhuma.
--
-- A chave primária é (client_id, month) de verdade, e não um índice único
-- parcial: ON CONFLICT consegue inferi-la. Já tomei um 42P10 neste projeto por
-- tentar upsert contra índice parcial, e o erro foi engolido silenciosamente.

create table if not exists client_monthly_sales (
  client_id uuid not null references clients(id) on delete cascade,
  month date not null,
  -- Valor vendido no mês, na moeda do cliente.
  revenue numeric(14, 2),
  -- Quantidade de pedidos/vendas. Opcional: alguns clientes só têm o valor.
  orders integer,
  note text,
  updated_at timestamptz not null default now(),
  primary key (client_id, month),
  constraint client_monthly_sales_month_is_first_day check (extract(day from month) = 1),
  constraint client_monthly_sales_revenue_nonneg check (revenue is null or revenue >= 0),
  constraint client_monthly_sales_orders_nonneg check (orders is null or orders >= 0)
);

comment on table client_monthly_sales is
  'Vendas reais informadas manualmente por mês. Comparadas com o investimento agregado de daily_account_metrics.';

-- Quais clientes entram no acompanhamento. Fora deles a tela não pede nada:
-- linha vazia esperando número é ruído, não lembrete.
alter table clients add column if not exists track_sales boolean not null default false;

-- A leitura da tela é sempre "últimos N meses dos clientes acompanhados".
create index if not exists idx_client_monthly_sales_month on client_monthly_sales (month desc);
