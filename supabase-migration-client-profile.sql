-- Dados operacionais do cliente: contato, documentos e vigência contratual.
-- Aditiva e idempotente. Execute depois das migrations de clientes.

alter table clients
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists whatsapp_phone text,
  add column if not exists drive_folder_url text,
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists contract_notice_days smallint not null default 30;

alter table clients
  drop constraint if exists clients_contract_notice_days_check;

alter table clients
  add constraint clients_contract_notice_days_check
  check (contract_notice_days between 0 and 365);

create index if not exists idx_clients_contract_end_date
  on clients(contract_end_date)
  where contract_end_date is not null;

