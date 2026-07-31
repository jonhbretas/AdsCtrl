-- Cobrança recorrente por cliente via Asaas.

alter table clients add column if not exists asaas_customer_id text;
create unique index if not exists uq_clients_asaas_customer_id on clients(asaas_customer_id) where asaas_customer_id is not null;

create table if not exists client_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  asaas_subscription_id text not null unique,
  billing_type text not null,
  cycle text not null default 'MONTHLY',
  value numeric(14,2) not null check (value > 0),
  next_due_date date not null,
  status text not null default 'ACTIVE',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_billing_charges (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  subscription_id uuid references client_billing_subscriptions(id) on delete set null,
  asaas_payment_id text not null unique,
  status text not null,
  value numeric(14,2),
  due_date date,
  payment_url text,
  invoice_url text,
  pix_qr_code text,
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists asaas_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_name text not null,
  payment_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_billing_subscriptions_client on client_billing_subscriptions(client_id, status);
create index if not exists idx_billing_charges_client on client_billing_charges(client_id, due_date desc);
