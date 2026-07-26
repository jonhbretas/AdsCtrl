-- ==========================================================================
-- Migração: separar SALDO (pré-pago) de FATURA EM ABERTO (pós-pago).
--
-- O problema: ad_accounts.balance vinha preenchido para todas as contas, mas
-- o número não significava a mesma coisa. Em conta pré-paga é saldo restante;
-- em conta de cartão ou PayPal, o campo `balance` da Meta é o valor JÁ GASTO e
-- ainda não faturado — quanto se deve, não quanto se tem. Ler as duas coisas
-- na mesma coluna leva à decisão errada.
--
-- Aditiva e idempotente.
-- ==========================================================================

alter table ad_accounts add column if not exists is_prepaid boolean;
-- Valor gasto e ainda não cobrado (só faz sentido em conta pós-paga).
alter table ad_accounts add column if not exists unbilled_amount numeric;

-- Os valores atuais de `balance` em contas pós-pagas são fatura em aberto
-- gravada como saldo. Limpar evita que a tela siga mostrando o número errado
-- até a próxima coleta; is_prepaid nulo faz a interface omitir em vez de
-- afirmar o que não sabe.
update ad_accounts set balance = null where is_prepaid is null and platform = 'meta';

comment on column ad_accounts.is_prepaid is
  'true = conta pré-paga (balance é saldo restante); false = pós-paga (ver unbilled_amount)';
comment on column ad_accounts.unbilled_amount is
  'Gasto ainda não faturado em conta pós-paga. NÃO é saldo disponível.';
