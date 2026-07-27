-- ==========================================================================
-- Migração: comentários e listas de verificação nas tarefas.
--
-- O cartão contava o que fazer, mas não guardava a conversa nem os passos.
-- Duas coisas que faltavam para o quadro cobrir o ciclo inteiro:
--
--   1. task_comments — a decisão tomada no WhatsApp ("cliente aprovou, mas
--      pediu versão 15s") morria no chat. Comentário no cartão é onde ela
--      fica junto do trabalho que ela muda.
--
--   2. task_checklists / task_checklist_items — "subir os criativos da Ana"
--      é uma tarefa; "baixar, renomear, subir, conferir, avisar" são os
--      passos. A lista mostra o progresso (2/5) sem abrir o cartão.
--
-- Aproveita e fecha uma brecha: tasks, projects e task_digests nasceram
-- depois da blindagem (supabase-migration-security.sql) e nunca tiveram RLS
-- ativado. Como o app só fala com o banco pela service role, ativar RLS sem
-- políticas não muda nada para o app — e tira as tabelas da API pública.
--
-- Aditiva e idempotente.
-- ==========================================================================

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A conversa se lê na ordem em que aconteceu.
create index if not exists idx_task_comments_task on task_comments(task_id, created_at);

create table if not exists task_checklists (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_checklists_task on task_checklists(task_id, position, created_at);

create table if not exists task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references task_checklists(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- Guarda quando foi marcado: o progresso "3/5" na tela é suficiente, mas o
  -- histórico de quando cada passo caiu é o que responde "isso ficou pronto
  -- quando?" sem abrir o chat.
  done_at timestamptz
);

create index if not exists idx_task_checklist_items_list on task_checklist_items(checklist_id, position, created_at);

-- Apagar a tarefa leva comentários e listas junto (cascade acima): o cartão é
-- o dono da conversa e dos passos dele. Apagar uma lista leva só os itens
-- dela — a tarefa e as outras listas ficam.

-- --------------------------------------------------------------------------
-- RLS: as tabelas do quadro (e as novas) saem da API pública do Supabase.
-- O app usa a service role, que ignora RLS — então nada muda para o app.
-- --------------------------------------------------------------------------
alter table if exists public.tasks enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.task_digests enable row level security;
alter table if exists public.task_comments enable row level security;
alter table if exists public.task_checklists enable row level security;
alter table if exists public.task_checklist_items enable row level security;

comment on table task_comments is
  'Conversa anexada à tarefa (ver app/api/tasks/comments).';
comment on table task_checklists is
  'Listas de verificação da tarefa; o progresso (done/total) aparece no cartão.';
comment on table task_checklist_items is
  'Passo de uma lista de verificação. done_at registra quando caiu.';
