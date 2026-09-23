-- harness_supabase.sql - a local stand-in for the tracker's Supabase database, for tools/sql/test_privacy_pg.py.
-- NOT FOR THE LIVE DATABASE. It builds what Supabase provides (roles, auth.uid(), auth.users) and the app's
-- seven tables with the columns the app reads and writes (WIRE HT-29 recon of app.js, plus the migrations
-- in the HT batches), then the policies the live database is BELIEVED to hold - owner-only journals,
-- co-member reads of days/profiles/circles, and a circle_members policy that shows each person only their
-- own row, which is the one assumption that reproduces "Cory sees no member, Andrew sees no Cory".

create extension if not exists pgcrypto;
create publication supabase_realtime;                         -- Supabase creates it empty

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.profiles (id uuid primary key references auth.users on delete cascade,
                              display_name text, handle text);
create table public.profile_private (id uuid primary key references auth.users on delete cascade,
                                     birth_date date, target_age int);
create table public.habits (id uuid primary key default gen_random_uuid(),
                            user_id uuid not null references auth.users on delete cascade,
                            name text not null, group_name text, cadence text default 'daily', tier int,
                            minutes int, link text, sort_order int, active boolean default true,
                            archived_at timestamptz, created_at timestamptz default now(), cue text,
                            planned_start time, planned_end time, notes text, time_anchor time,
                            minutes_planned int, domain text);
create table public.days (user_id uuid not null references auth.users on delete cascade, date date not null,
                          checked jsonb default '{}'::jsonb, active_set jsonb default '[]'::jsonb, pct int,
                          floor_pct int, closed_at timestamptz, primary key (user_id, date));
create table public.day_private (user_id uuid not null references auth.users on delete cascade,
                                 date date not null, rating int, why text, tasks text, prayer text,
                                 predict boolean, brain_dump text, sleep_hours numeric, weight_lb numeric,
                                 tomorrow_one_thing text, bed_time time, wake_time time,
                                 primary key (user_id, date));
create table public.circles (id uuid primary key default gen_random_uuid(), name text,
                             join_code text unique, owner_id uuid references auth.users on delete cascade);
create table public.circle_members (circle_id uuid references public.circles on delete cascade,
                                    user_id uuid references auth.users on delete cascade,
                                    primary key (circle_id, user_id));

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;            -- the live 42501 for anon (128 probe)

create or replace function public.is_in_circle(c uuid) returns boolean language sql stable
  security definer set search_path = public as
$$ select exists (select 1 from circle_members m where m.circle_id = c and m.user_id = auth.uid()) $$;
create or replace function public.shares_circle_with(u uuid) returns boolean language sql stable
  security definer set search_path = public as
$$ select exists (select 1 from circle_members a join circle_members b on a.circle_id = b.circle_id
                   where a.user_id = auth.uid() and b.user_id = u) $$;
create or replace function public.join_circle(code text) returns uuid language plpgsql
  security definer set search_path = public as
$$ declare cid uuid;
   begin
     select id into cid from circles where join_code = code;
     if cid is null then raise exception 'NO_SUCH_CIRCLE'; end if;
     insert into circle_members (circle_id, user_id) values (cid, auth.uid());   -- a second join raises 23505
     return cid;
   end $$;

alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;
alter table public.habits          enable row level security;
alter table public.days            enable row level security;
alter table public.day_private     enable row level security;
alter table public.circles         enable row level security;
alter table public.circle_members  enable row level security;

create policy "habits owner"          on public.habits          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "day_private owner"     on public.day_private     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profile_private owner" on public.profile_private for all using (id = auth.uid()) with check (id = auth.uid());
create policy "days read"             on public.days            for select using (user_id = auth.uid() or public.shares_circle_with(user_id));
create policy "days write"            on public.days            for insert with check (user_id = auth.uid());
create policy "days update"           on public.days            for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profiles read"         on public.profiles        for select using (id = auth.uid() or public.shares_circle_with(id));
create policy "profiles update"       on public.profiles        for update using (id = auth.uid());
create policy "circles read"          on public.circles         for select using (owner_id = auth.uid() or public.is_in_circle(id));
create policy "circles insert"        on public.circles         for insert with check (owner_id = auth.uid());
create policy "members self"          on public.circle_members  for select using (user_id = auth.uid());
create policy "members insert"        on public.circle_members  for insert with check (user_id = auth.uid());
