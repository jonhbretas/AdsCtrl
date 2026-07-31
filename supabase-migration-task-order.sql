-- Ordem manual do quadro de tarefas.
alter table tasks add column if not exists position integer;

-- Tarefas antigas ficam na ordem atual aproximada; novas posições passam a ser
-- controladas pelo quadro.
with ranked as (
  select id, row_number() over (partition by status order by due_date nulls last, created_at desc) - 1 as position
  from tasks
)
update tasks set position = ranked.position
from ranked
where tasks.id = ranked.id and tasks.position is null;

create index if not exists idx_tasks_board_order on tasks(status, position, due_date, created_at desc);
