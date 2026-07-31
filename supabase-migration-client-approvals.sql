-- Solicitações e aprovações de materiais/entregas do cliente.

create table if not exists client_approvals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null default 'request',
  title text not null,
  description text,
  file_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'rejected')),
  response_note text,
  due_date date,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_approvals_client_status on client_approvals(client_id, status, requested_at desc);
