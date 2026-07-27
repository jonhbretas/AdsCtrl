  -- ==========================================================================
  -- Migração: projetos com prazo, contexto do alerta na tarefa e registro dos
  -- lembretes por e-mail.
  --
  -- Três coisas que faltavam para o quadro fechar o ciclo:
  --
  --   1. projects — tarefa é unidade de execução, projeto é o compromisso com
  --      data ("Lançamento da Ana, dia 15"). Sem ele, o prazo do compromisso só
  --      existia na tarefa que por acaso fosse a última.
  --
  --   2. tasks.alert_type / tasks.context — a tarefa automática já dizia QUAL era
  --      o problema no título, mas o app não sabia PARA ONDE levar quem vai
  --      resolvê-lo. Guardando o tipo do alerta e os IDs envolvidos, o cartão
  --      abre a tela certa já filtrada (ex.: os criativos reprovados).
  --
  --   3. task_digests — o lembrete diário sai junto da coleta. Sem registro, um
  --      retry da coleta mandaria o mesmo e-mail duas vezes.
  --
  -- Aditiva e idempotente.
  -- ==========================================================================

  create table if not exists projects (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    notes text,
    client_id uuid references clients(id) on delete set null,
    -- O prazo do compromisso. Nulo é permitido: projeto sem data ainda serve
    -- para agrupar, só não é cobrado por e-mail.
    due_date date,
    status text not null default 'active',  -- active | done | archived
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    done_at timestamptz,
    constraint projects_status_check check (status in ('active', 'done', 'archived'))
  );

  -- A lista lê por status e ordena por prazo.
  create index if not exists idx_projects_status on projects(status, due_date);
  create index if not exists idx_projects_client on projects(client_id);

  -- on delete set null e não cascade: apagar um projeto não pode levar embora o
  -- trabalho que ainda existe. As tarefas voltam a ser soltas.
  alter table tasks
    add column if not exists project_id uuid references projects(id) on delete set null;

  -- Tipo do alerta que originou a tarefa (low_balance, rejected_creative…) e o
  -- que ele encontrou (ex.: {"ad_ids": [...], "ad_names": [...]}). O fingerprint
  -- já embutia o tipo, mas em texto colado — o cartão precisa dele em campo.
  alter table tasks add column if not exists alert_type text;
  alter table tasks add column if not exists context jsonb;

  create index if not exists idx_tasks_project on tasks(project_id);

  create table if not exists task_digests (
    id bigserial primary key,
    digest_date date not null,
    trigger text not null default 'auto',   -- auto | manual
    recipient text,
    status text not null,                   -- sent | skipped | error
    tasks_count integer not null default 0,
    projects_count integer not null default 0,
    reason text,
    provider_message_id text,
    created_at timestamptz not null default now()
  );

  -- Uma cobrança automática por dia. Parcial de propósito: o disparo manual
  -- ("enviar agora", nas Configurações) pode repetir quantas vezes for preciso.
  -- O código consulta antes de inserir em vez de usar ON CONFLICT — índice
  -- parcial não é inferível num upsert (erro 42P10), lição da migração de tasks.
  create unique index if not exists uq_task_digests_auto_day
    on task_digests(digest_date)
    where trigger = 'auto' and status = 'sent';

  create index if not exists idx_task_digests_recent on task_digests(created_at desc);

  comment on table projects is
    'Compromisso com prazo que agrupa tarefas (tasks.project_id).';
  comment on table task_digests is
    'Histórico do lembrete de pendências por e-mail. Ver lib/task-digest.ts.';
