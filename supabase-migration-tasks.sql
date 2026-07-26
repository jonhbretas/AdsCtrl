-- ==========================================================================
-- Migração: quadro de tarefas (kanban).
--
-- Existe por um motivo concreto: criativo que o cliente manda por WhatsApp não
-- aparece em nenhuma API. A tarefa precisa nascer no momento em que a coisa
-- chega, senão depende de memória — e é aí que ela se perde.
--
-- Duas origens no mesmo quadro:
--   manual — o que você anota ("subir criativo da Ana até sexta");
--   auto   — o que a coleta detecta (saldo acabando, criativo reprovado).
--
-- Aditiva e idempotente.
-- ==========================================================================

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  -- Link do criativo (Drive, WeTransfer) ou de qualquer referência externa.
  link text,
  status text not null default 'todo',   -- todo | doing | done
  priority text not null default 'normal', -- normal | high
  due_date date,
  client_id uuid references clients(id) on delete set null,
  account_id text,
  source text not null default 'manual', -- manual | auto
  -- Impressão digital do alerta que originou a tarefa. Enquanto o problema
  -- persiste a coleta reencontra o mesmo alerta todos os dias; o índice único
  -- abaixo garante que isso não vire uma tarefa nova por dia.
  alert_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);

create unique index if not exists uq_tasks_alert
  on tasks(alert_fingerprint) where alert_fingerprint is not null;

-- O quadro lê por status e ordena por prazo; o histórico lê por data de baixa.
create index if not exists idx_tasks_status on tasks(status, due_date);
create index if not exists idx_tasks_done on tasks(done_at desc);
create index if not exists idx_tasks_client on tasks(client_id);

comment on table tasks is
  'Quadro de tarefas. source=auto vem de alerta da coleta (ver alert_fingerprint).';
