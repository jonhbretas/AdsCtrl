-- Dados cadastrais e do representante legal usados em contratos e documentos.
-- Aditiva e idempotente. Execute depois de supabase-migration-client-profile.sql.

alter table clients
  add column if not exists person_type text not null default 'juridica',
  add column if not exists cpf text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip_code text,
  add column if not exists address_country text not null default 'Brasil',
  add column if not exists state_registration text,
  add column if not exists municipal_registration text,
  add column if not exists legal_representative_name text,
  add column if not exists legal_representative_cpf text,
  add column if not exists legal_representative_role text,
  add column if not exists billing_email text,
  add column if not exists billing_phone text;

alter table clients
  drop constraint if exists clients_person_type_check;

alter table clients
  add constraint clients_person_type_check
  check (person_type in ('fisica', 'juridica'));

create index if not exists idx_clients_person_type on clients(person_type);

