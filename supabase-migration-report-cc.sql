-- Vários destinatários no relatório semanal: lista em "para" (separada por
-- vírgula) e endereços de cópia (CC), ambos opcionais.
-- Migração aditiva/idempotente. Rode UMA VEZ no SQL Editor do Supabase.

-- Destinatários do relatório. report_email já existia e pode guardar uma
-- lista separada por vírgula — o texto é livre. CC é só informação: o Resend
-- recebe o array na hora do envio, não precisa de tabela própria.
alter table clients add column if not exists report_cc text;
