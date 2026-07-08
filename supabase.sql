-- CaseSim schema. Run once in the Supabase dashboard: SQL Editor -> New query.
-- Single-user local app: the anon key gets full access via permissive policies.

create table if not exists cases (
  id uuid primary key,
  title text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key,
  case_id uuid references cases(id) on delete set null,
  case_title text not null,
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'ended',
  data jsonb not null
);

create table if not exists reviews (
  id uuid primary key,
  session_id uuid references sessions(id) on delete cascade,
  case_id uuid,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table cases enable row level security;
alter table sessions enable row level security;
alter table reviews enable row level security;

drop policy if exists "anon full access" on cases;
create policy "anon full access" on cases for all to anon using (true) with check (true);

drop policy if exists "anon full access" on sessions;
create policy "anon full access" on sessions for all to anon using (true) with check (true);

drop policy if exists "anon full access" on reviews;
create policy "anon full access" on reviews for all to anon using (true) with check (true);
