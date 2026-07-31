-- Regras de receitas/despesas recorrentes, independentes do Asaas.

create table if not exists financial_recurring_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  category_id uuid references financial_categories(id) on delete set null,
  kind text not null check (kind in ('revenue', 'expense')),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  day_of_month smallint not null default 10 check (day_of_month between 1 and 28),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_recurring_active on financial_recurring_rules(active, starts_on);
