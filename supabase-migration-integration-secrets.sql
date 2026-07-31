-- Segredos de integrações gerenciados pelo servidor.
-- Nunca são devolvidos pelas APIs do painel.

create table if not exists integration_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table integration_secrets enable row level security;
drop policy if exists integration_secrets_service_only on integration_secrets;
create policy integration_secrets_service_only on integration_secrets
  for all using (false) with check (false);

