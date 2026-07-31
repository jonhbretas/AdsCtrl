-- Checklist operacional de entrada e ativação do cliente.

create table if not exists client_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  position smallint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'blocked')),
  due_date date,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, code)
);

create index if not exists idx_onboarding_client_position on client_onboarding_items(client_id, position);
