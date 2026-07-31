-- Livro-caixa e DRE operacional da agência.

create table if not exists financial_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('revenue', 'expense')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, kind)
);

create table if not exists financial_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  category_id uuid references financial_categories(id) on delete set null,
  kind text not null check (kind in ('revenue', 'expense')),
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'cancelled')),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  paid_at timestamptz,
  source text not null default 'manual',
  external_id text,
  recurrence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_financial_entries_external
  on financial_entries(source, external_id);
create index if not exists idx_financial_entries_due on financial_entries(due_date desc, kind, status);
create index if not exists idx_financial_entries_client on financial_entries(client_id, due_date desc);

insert into financial_categories (name, kind) values
  ('Mensalidades de clientes', 'revenue'),
  ('Projetos avulsos', 'revenue'),
  ('Outras receitas', 'revenue'),
  ('Folha e pró-labore', 'expense'),
  ('Ferramentas e softwares', 'expense'),
  ('Impostos', 'expense'),
  ('Prestadores', 'expense'),
  ('Marketing e vendas', 'expense'),
  ('Outras despesas', 'expense')
on conflict (name, kind) do nothing;
