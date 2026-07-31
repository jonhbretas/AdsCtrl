-- Notas fiscais de serviço vinculadas às cobranças do Asaas.

create table if not exists client_billing_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  asaas_invoice_id text not null unique,
  asaas_payment_id text,
  status text not null,
  service_description text not null,
  value numeric(14,2),
  effective_date date,
  pdf_url text,
  xml_url text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_invoices_client on client_billing_invoices(client_id, created_at desc);
