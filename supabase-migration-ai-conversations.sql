-- supabase-migration-ai-conversations.sql
-- Rode no SQL Editor do Supabase.
-- Conversas salvas do Assertivus IA: arquivo de pesquisas já feitas, com
-- vínculo opcional a cliente (via conta) e a grupo — para voltar a uma
-- análise anterior ou filtrar o histórico por cliente/grupo.

create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  account_id text references ad_accounts(account_id) on delete set null,
  group_id uuid references client_groups(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  messages jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_conversations_group on ai_conversations(group_id);
create index if not exists idx_ai_conversations_client on ai_conversations(client_id);
create index if not exists idx_ai_conversations_account on ai_conversations(account_id);
create index if not exists idx_ai_conversations_updated on ai_conversations(updated_at desc);
