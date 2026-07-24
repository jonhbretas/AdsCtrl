-- ==========================================================================
-- Fundação de clientes do AdsCtrl
--
-- Esta migração é estritamente aditiva e idempotente:
--   - não remove tabelas, colunas ou linhas;
--   - preserva ad_accounts como catálogo das plataformas;
--   - cria um cliente para cada conta Meta existente;
--   - reaproveita linked_meta_account_id para vincular as contas Google
--     previamente associadas ao mesmo cliente.
--
-- Rode todo o arquivo no SQL Editor do Supabase.
-- ==========================================================================

-- Mantém esta migração independente da migração anterior de vínculos.
alter table ad_accounts
  add column if not exists linked_meta_account_id text
  references ad_accounts(account_id) on delete set null;

alter table ad_accounts
  add column if not exists hidden boolean not null default false;

create index if not exists idx_accounts_linked_meta
  on ad_accounts(linked_meta_account_id);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  objective text,
  result_family text,
  primary_kpi text,
  target_value numeric,
  monthly_budget numeric,
  monthly_conversion_goal numeric,
  currency text not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  budget_start_day smallint not null default 1,
  notes text,
  source_meta_account_id text references ad_accounts(account_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_status_check
    check (status in ('active', 'paused', 'archived')),
  constraint clients_target_value_check
    check (target_value is null or target_value >= 0),
  constraint clients_monthly_budget_check
    check (monthly_budget is null or monthly_budget >= 0),
  constraint clients_monthly_conversion_goal_check
    check (monthly_conversion_goal is null or monthly_conversion_goal >= 0),
  constraint clients_budget_start_day_check
    check (budget_start_day between 1 and 28)
);

alter table clients
  add column if not exists result_family text;

create unique index if not exists uq_clients_source_meta_account
  on clients(source_meta_account_id)
  where source_meta_account_id is not null;

create index if not exists idx_clients_status_name
  on clients(status, name);

create table if not exists client_ad_accounts (
  client_id uuid not null references clients(id) on delete cascade,
  account_id text not null references ad_accounts(account_id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (client_id, account_id),
  constraint uq_client_ad_accounts_account unique (account_id)
);

create index if not exists idx_client_ad_accounts_client
  on client_ad_accounts(client_id);

-- Compatibilidade imediata: a conta Meta que antes representava o cliente
-- origina uma entidade clients. ON CONFLICT torna o backfill reexecutável.
insert into clients (
  name,
  status,
  currency,
  source_meta_account_id
)
select
  aa.name,
  case when aa.hidden then 'paused' else 'active' end,
  coalesce(nullif(aa.currency, ''), 'BRL'),
  aa.account_id
from ad_accounts aa
where aa.platform = 'meta'
on conflict do nothing;

-- A conta Meta de origem é o vínculo principal do cliente.
insert into client_ad_accounts (
  client_id,
  account_id,
  is_primary
)
select
  c.id,
  c.source_meta_account_id,
  true
from clients c
where c.source_meta_account_id is not null
on conflict (account_id) do nothing;

-- Contas Google já vinculadas por linked_meta_account_id acompanham o cliente.
insert into client_ad_accounts (
  client_id,
  account_id,
  is_primary
)
select
  c.id,
  google_account.account_id,
  false
from ad_accounts google_account
join clients c
  on c.source_meta_account_id = google_account.linked_meta_account_id
where google_account.platform = 'google'
on conflict (account_id) do nothing;

-- Operações atômicas usadas pelas APIs. Se qualquer validação ou gravação
-- falhar, o PostgreSQL desfaz toda a função e evita vínculos divergentes.
create or replace function public.link_google_account_to_client(
  p_google_account_id text,
  p_meta_account_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_google_platform text;
  v_meta_platform text;
  v_meta_hidden boolean;
  v_client_id uuid;
  v_client_status text;
begin
  select platform into v_google_platform
  from ad_accounts where account_id = p_google_account_id;
  if not found or v_google_platform <> 'google' then
    raise exception 'A conta de origem precisa existir e ser Google.';
  end if;

  if p_meta_account_id is not null then
    select platform, hidden into v_meta_platform, v_meta_hidden
    from ad_accounts where account_id = p_meta_account_id;
    if not found or v_meta_platform <> 'meta' then
      raise exception 'A conta de destino precisa existir e ser Meta.';
    end if;
    if v_meta_hidden then
      raise exception 'Reative a conta Meta antes de usá-la como cliente.';
    end if;

    select id, status into v_client_id, v_client_status
    from clients where source_meta_account_id = p_meta_account_id;
    if not found then
      raise exception 'Cliente da conta Meta não encontrado. Reexecute a migração de clientes.';
    end if;
    if v_client_status <> 'active' then
      raise exception 'O cliente Meta precisa estar ativo antes do vínculo.';
    end if;
  end if;

  update ad_accounts
  set linked_meta_account_id = p_meta_account_id, updated_at = now()
  where account_id = p_google_account_id;

  delete from client_ad_accounts where account_id = p_google_account_id;
  if v_client_id is not null then
    insert into client_ad_accounts (client_id, account_id, is_primary)
    values (v_client_id, p_google_account_id, false)
    on conflict (account_id) do update
      set client_id = excluded.client_id, is_primary = false;
  end if;

  return jsonb_build_object(
    'account_id', p_google_account_id,
    'linked_meta_account_id', p_meta_account_id
  );
end;
$$;

create or replace function public.set_adsctrl_account_hidden(
  p_account_id text,
  p_hidden boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_platform text;
begin
  select platform into v_platform
  from ad_accounts where account_id = p_account_id;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  if v_platform = 'meta' then
    update clients
    set status = case when p_hidden then 'paused' else 'active' end,
        updated_at = now()
    where source_meta_account_id = p_account_id;
    if not found then
      raise exception 'Cliente da conta Meta não encontrado. Reexecute a migração de clientes.';
    end if;
  end if;

  update ad_accounts
  set hidden = p_hidden, updated_at = now()
  where account_id = p_account_id;

  return jsonb_build_object(
    'account_id', p_account_id,
    'hidden', p_hidden,
    'platform', v_platform
  );
end;
$$;

revoke all on function public.link_google_account_to_client(text, text) from public, anon, authenticated;
revoke all on function public.set_adsctrl_account_hidden(text, boolean) from public, anon, authenticated;
grant execute on function public.link_google_account_to_client(text, text) to service_role;
grant execute on function public.set_adsctrl_account_hidden(text, boolean) to service_role;
