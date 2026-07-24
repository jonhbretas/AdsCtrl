-- Vincula uma conta Google Ads a uma conta Meta, que representa o cliente.
-- Migração 100% aditiva: não remove nem altera dados existentes.
-- Rode uma vez no SQL Editor do Supabase antes de publicar esta versão.

alter table ad_accounts
  add column if not exists linked_meta_account_id text
  references ad_accounts(account_id) on delete set null;

create index if not exists idx_accounts_linked_meta
  on ad_accounts(linked_meta_account_id);
