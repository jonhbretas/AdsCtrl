-- Histórico de contratos e acervo documental por cliente.
-- Os arquivos continuam no Google Drive; estas tabelas guardam metadados e links.

create table if not exists client_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  version text,
  status text not null default 'draft',
  start_date date,
  end_date date,
  monthly_fee numeric(14,2),
  drive_file_url text,
  signed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_contracts_status_check check (status in ('draft', 'active', 'expired', 'cancelled')),
  constraint client_contracts_fee_check check (monthly_fee is null or monthly_fee >= 0)
);

create table if not exists client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  category text not null default 'other',
  name text not null,
  drive_file_url text,
  visible_to_client boolean not null default false,
  document_date date,
  expires_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_contracts_client on client_contracts(client_id, end_date desc);
create index if not exists idx_client_documents_client on client_documents(client_id, created_at desc);
create index if not exists idx_client_documents_expiry on client_documents(expires_at) where expires_at is not null;

