-- supabase-migration-social.sql
-- Página do Facebook e conta comercial do Instagram, por cliente — o que
-- falta para o relatório trazer alcance/seguidores/posts orgânicos junto do
-- pago (ver lib/meta-social.ts).
--
-- Preencher aqui NÃO ativa nada sozinho: a Meta só devolve dado de Página
-- para quem a Página foi atribuída, na Business Manager, ao mesmo usuário de
-- sistema que gera o META_ACCESS_TOKEN. Enquanto isso não for feito manualmente
-- na BM, estas colunas ficam vazias e o relatório segue só com o pago —
-- exatamente como está hoje.

alter table clients add column if not exists facebook_page_id text;
alter table clients add column if not exists instagram_business_id text;

comment on column clients.facebook_page_id is 'ID numérico da Página do Facebook do cliente. Exige a Página atribuída ao usuário de sistema na BM.';
comment on column clients.instagram_business_id is 'ID da conta comercial do Instagram (IG User ID), vinculada à mesma Página.';
