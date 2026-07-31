-- Agenda operacional e reuniões da agência.

create table if not exists client_meetings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  meeting_type text not null default 'follow_up',
  location text,
  meeting_url text,
  attendees text,
  reminder_minutes integer not null default 30,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_meetings_time_check check (ends_at > starts_at)
);

create index if not exists idx_client_meetings_starts on client_meetings(starts_at, status);
create index if not exists idx_client_meetings_client on client_meetings(client_id, starts_at desc);
