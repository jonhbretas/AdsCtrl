-- Migração aditiva/idempotente.
-- 1) "Em pausa combinada" por conta de anúncio: quando o cliente/conta está
--    parado de propósito, o alerta crítico "sem rodar 24h" é suprimido.
-- 2) Contexto do alerta (jsonb) para o cartão abrir a tela certa já filtrada:
--    campanha/conjunto/criativo de cada alerta, igual ao que a tarefa guarda.
alter table ad_accounts add column if not exists on_hold boolean not null default false;
alter table alerts add column if not exists context jsonb;
