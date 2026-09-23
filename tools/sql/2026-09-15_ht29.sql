-- 2026-09-15_ht29.sql - WIRE HT-29 (paste 133): privacy sealed at the table · the group both ways ·
-- a section on every standard · the evening nudge's subscriptions.
--
-- HOW TO RUN (2 minutes). Supabase -> SQL Editor -> New query -> paste this whole file -> Run.
-- ONE transaction: it applies completely or not at all. SAFE TO RUN TWICE: a second run changes nothing.
-- UNDO: 2026-09-15_ht29_rollback.sql (restores the policies this file replaced, from the backup it takes).
-- Proven against a local Postgres with Supabase's roles before it was handed over: tools/sql/test_privacy_pg.py.
--
-- WHAT CHANGES, AND WHAT DOES NOT
--  1 · day_private, profile_private, habits -> OWNER-ONLY in every direction. Every existing policy on
--      these three tables is copied into ht29_policy_backup and then replaced by four owner policies.
--      Nobody's own access changes; any wider policy that may exist is gone. The journal (brain dump ·
--      completed · prayer · the rating's why) can be read by its author and by no one else.
--  2 · habits.section ('morning' | 'night' | 'standards' | 'weekly'). Paste 133 Ruling 3: every standard
--      is placed where it shows TODAY and a person moves it after - weekly -> Weekly, a planned time ->
--      Morning, no time -> Standards; the Sabbath -> Night (paste 133 S2.10). Only rows with no section
--      are placed, so a second run places nothing. Rows are updated, never inserted or deleted: the
--      result grid at the end prints the count before and after.
--  3 · The group, both ways: a member sees every membership row of a circle they are in - the reason two
--      members could not see each other - and can read co-members' names, days and circles.
--      ADDITIVE ONLY on days / profiles / circles / circle_members: no existing policy there is touched.
--      Those four get a co-member SELECT policy and nothing else, so this file REFUSES TO RUN if row level
--      security is off on any of them (switching it on there would block their owners' own writes). It reads
--      the switch first, records it in ht29_rls_backup for the undo, and prints it in the grid at the end.
--  4 · Three functions hand a co-member exactly what paste 133 Ruling 4 allows, and nothing else:
--      ht29_member_day (task names, sections, planned times, definition of done, check-offs) ·
--      ht29_circle_ratings (the rating NUMBER only - one line reverses it, see the end) ·
--      ht29_join_circle (a join that can be repeated safely and says clearly when a code is wrong).
--  5 · push_subscriptions + nudge_prefs, owner-only. NO SCHEDULE is created here (R70.344: nothing is
--      armed until Cory says "arm"); the schedule is its own file, 2026-09-15_ht29_arm.sql.
--  5b· app_config (read-only for signed-in people): holds the Google sign-in id when there is one.
--  6 · days, day_private and habits join Supabase Realtime, so a phone's check-off reaches the desktop at once.
-- No grant to anon. No row deleted. No column dropped.

create temp table if not exists ht29_before as
  select now() as at, count(*)::int as standards from public.habits;

begin;

-- ---------------------------------------------------------------------------------------------- 0 · backup
create table if not exists public.ht29_policy_backup (
  taken_at   timestamptz not null default now(),
  tablename  text not null,
  policyname text not null,
  permissive text, roles text[], cmd text, qual text, with_check text
);
alter table public.ht29_policy_backup enable row level security;       -- no policy: only the owner reads it
revoke all on public.ht29_policy_backup from anon, authenticated;

insert into public.ht29_policy_backup (tablename, policyname, permissive, roles, cmd, qual, with_check)
select p.tablename, p.policyname, p.permissive, p.roles::text[], p.cmd, p.qual, p.with_check
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename in ('day_private', 'profile_private', 'habits')
   and p.policyname not like 'ht29\_%'
   and not exists (select 1 from public.ht29_policy_backup);           -- the first run only

-- ------------------------------------------------------------------------ 1 · the three owner-only tables
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('day_private', 'profile_private', 'habits')
              and policyname not like 'ht29\_%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.day_private     enable row level security;
alter table public.profile_private enable row level security;
alter table public.habits          enable row level security;

drop policy if exists ht29_owner_select on public.day_private;
drop policy if exists ht29_owner_insert on public.day_private;
drop policy if exists ht29_owner_update on public.day_private;
drop policy if exists ht29_owner_delete on public.day_private;
create policy ht29_owner_select on public.day_private for select to authenticated using (user_id = auth.uid());
create policy ht29_owner_insert on public.day_private for insert to authenticated with check (user_id = auth.uid());
create policy ht29_owner_update on public.day_private for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ht29_owner_delete on public.day_private for delete to authenticated using (user_id = auth.uid());

drop policy if exists ht29_owner_select on public.profile_private;
drop policy if exists ht29_owner_insert on public.profile_private;
drop policy if exists ht29_owner_update on public.profile_private;
drop policy if exists ht29_owner_delete on public.profile_private;
create policy ht29_owner_select on public.profile_private for select to authenticated using (id = auth.uid());
create policy ht29_owner_insert on public.profile_private for insert to authenticated with check (id = auth.uid());
create policy ht29_owner_update on public.profile_private for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy ht29_owner_delete on public.profile_private for delete to authenticated using (id = auth.uid());

drop policy if exists ht29_owner_select on public.habits;
drop policy if exists ht29_owner_insert on public.habits;
drop policy if exists ht29_owner_update on public.habits;
drop policy if exists ht29_owner_delete on public.habits;
create policy ht29_owner_select on public.habits for select to authenticated using (user_id = auth.uid());
create policy ht29_owner_insert on public.habits for insert to authenticated with check (user_id = auth.uid());
create policy ht29_owner_update on public.habits for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ht29_owner_delete on public.habits for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------- 2 · sections
alter table public.habits add column if not exists section text;
alter table public.habits drop constraint if exists habits_section_ht29;
alter table public.habits add constraint habits_section_ht29
  check (section is null or section in ('morning', 'night', 'standards', 'weekly'));

-- the same rule the app uses to draw TIMED / ANYTIME / WEEKLY today (app.js bucketOf, isSabbathStd)
update public.habits
   set section = case
         when name ~* '^\s*sabbath\y' or group_name ~* '^sabbath$'   then 'night'
         when cadence = 'weekly'                                     then 'weekly'
         when planned_start is not null or time_anchor is not null   then 'morning'
         else 'standards'
       end
 where section is null;

-- ------------------------------------------------------------------------------ 3 · the group, both ways
create or replace function public.ht29_in_circle(c uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.circle_members m where m.circle_id = c and m.user_id = auth.uid()) $$;

create or replace function public.ht29_shares_circle(other uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select other = auth.uid()
       or exists (select 1 from public.circle_members a
                    join public.circle_members b on b.circle_id = a.circle_id
                   where a.user_id = auth.uid() and b.user_id = other) $$;

-- MEASURE BEFORE YOU ENABLE, AND REFUSE RATHER THAN HALF-APPLY.
-- These four get the SELECT policy a co-member needs and nothing else, because their own owner policies are
-- already here. That is only safe if row-level security is ALREADY ON: turn it on for a table that had it off
-- and every write the app makes to that table becomes a silent 0-row statement - Cory's own check-offs first.
-- The rollback could not undo it either: dropping a policy from a table whose RLS this file switched on leaves
-- it locked harder than before. So the state is read, recorded for the undo, and a table with RLS off stops the
-- whole transaction with a message naming it. Nothing is guessed and nothing is half-done.
create table if not exists public.ht29_rls_backup (tablename text primary key, was_enabled boolean not null);
alter table public.ht29_rls_backup enable row level security;          -- no policy: only the owner reads it
revoke all on public.ht29_rls_backup from anon, authenticated;
insert into public.ht29_rls_backup (tablename, was_enabled)
select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('days', 'profiles', 'circles', 'circle_members', 'day_private', 'profile_private', 'habits')
on conflict (tablename) do nothing;                                    -- the first run's reading is the record

do $$
declare off_list text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into off_list
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('days', 'profiles', 'circles', 'circle_members')
     and not c.relrowsecurity;
  if off_list is not null then
    raise exception 'STOP - row level security is OFF on: %. This file adds only the co-member SELECT policy '
                    'for those tables, so switching RLS on here would block their own writes. Add the owner '
                    'policies for them first (or tell SPEC), then run this file again. Nothing was changed.',
                    off_list;
  end if;
end $$;

alter table public.days           enable row level security;
alter table public.profiles       enable row level security;
alter table public.circles        enable row level security;
alter table public.circle_members enable row level security;

drop policy if exists ht29_comember_select on public.circle_members;
create policy ht29_comember_select on public.circle_members for select to authenticated
  using (user_id = auth.uid() or public.ht29_in_circle(circle_id));

drop policy if exists ht29_comember_select on public.days;
create policy ht29_comember_select on public.days for select to authenticated
  using (public.ht29_shares_circle(user_id));

drop policy if exists ht29_comember_select on public.profiles;
drop policy if exists ht29_owner_insert on public.profiles;
drop policy if exists ht29_owner_update on public.profiles;
create policy ht29_comember_select on public.profiles for select to authenticated
  using (public.ht29_shares_circle(id));
create policy ht29_owner_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy ht29_owner_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists ht29_member_select on public.circles;
create policy ht29_member_select on public.circles for select to authenticated
  using (owner_id = auth.uid() or public.ht29_in_circle(id));

-- ------------------------------------------------------------- 4 · what a co-member may see, column by column
create or replace function public.ht29_join_circle(code text) returns uuid
  language plpgsql volatile security definer set search_path = public as
$$
declare cid uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '28000';
  end if;
  select c.id into cid from public.circles c where upper(c.join_code) = upper(btrim(code)) limit 1;
  if cid is null then
    raise exception 'NO_SUCH_CIRCLE' using errcode = 'P0002';
  end if;
  insert into public.circle_members (circle_id, user_id)
  select cid, auth.uid()
   where not exists (select 1 from public.circle_members m where m.circle_id = cid and m.user_id = auth.uid());
  return cid;
end $$;

create or replace function public.ht29_member_day(member uuid, d date) returns jsonb
  language plpgsql stable security definer set search_path = public as
$$
declare dayrow public.days%rowtype;
        dueset jsonb;
begin
  -- auth.uid() NULL makes ht29_shares_circle() return NULL, and `not NULL` is NULL - which is not TRUE, so the
  -- guard would fall through and hand back the whole day. The grant is revoked from public and anon below, but a
  -- privacy gate must not depend on a grant staying revoked: the caller is named explicitly.
  if auth.uid() is null or member is null or d is null
     or not coalesce(public.ht29_shares_circle(member), false) then
    return null;
  end if;
  select * into dayrow from public.days x where x.user_id = member and x.date = d;
  dueset := coalesce(to_jsonb(dayrow.active_set), '[]'::jsonb);        -- jsonb, json or an array: all read alike
  return jsonb_build_object(
    'user_id', member,
    'date', d,
    'checked', coalesce(to_jsonb(dayrow.checked), '{}'::jsonb),
    'active_set', dueset,
    'pct', dayrow.pct,
    'habits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'name', h.name, 'section', h.section, 'group_name', h.group_name,
               'cadence', h.cadence, 'planned_start', h.planned_start, 'planned_end', h.planned_end,
               'time_anchor', h.time_anchor, 'minutes_planned', h.minutes_planned,
               'done_def', h.notes, 'sort_order', h.sort_order, 'active', h.active)
             order by h.sort_order nulls last, h.name)
        from public.habits h
       where h.user_id = member
         and (h.active is true or dueset ? h.id::text)
    ), '[]'::jsonb));
end $$;

create or replace function public.ht29_circle_ratings(d0 date, d1 date)
  returns table (user_id uuid, date date, rating int)
  language sql stable security definer set search_path = public as
$$ select p.user_id, p.date, p.rating::int
     from public.day_private p
    where auth.uid() is not null                    -- named, so the gate never rests on a grant staying revoked
      and p.date between d0 and d1
      and p.rating is not null
      and p.user_id <> auth.uid()
      and coalesce(public.ht29_shares_circle(p.user_id), false) $$;

revoke execute on function public.ht29_in_circle(uuid)            from public, anon;
revoke execute on function public.ht29_shares_circle(uuid)        from public, anon;
revoke execute on function public.ht29_join_circle(text)          from public, anon;
revoke execute on function public.ht29_member_day(uuid, date)     from public, anon;
revoke execute on function public.ht29_circle_ratings(date, date) from public, anon;
grant  execute on function public.ht29_in_circle(uuid)            to authenticated;
grant  execute on function public.ht29_shares_circle(uuid)        to authenticated;
grant  execute on function public.ht29_join_circle(text)          to authenticated;
grant  execute on function public.ht29_member_day(uuid, date)     to authenticated;
grant  execute on function public.ht29_circle_ratings(date, date) to authenticated;

-- ------------------------------------------------------------------------------------------ 5 · nudges
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.nudge_prefs (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  enabled    boolean not null default false,
  noon       time not null default '12:00',
  evening    time not null default '21:00',
  on_sabbath boolean not null default false,
  tz         text not null default 'America/Chicago',
  last_sent  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
alter table public.nudge_prefs        enable row level security;
revoke all on public.push_subscriptions, public.nudge_prefs from anon;
grant select, insert, update, delete on public.push_subscriptions, public.nudge_prefs to authenticated;

drop policy if exists ht29_owner_all on public.push_subscriptions;
drop policy if exists ht29_owner_all on public.nudge_prefs;
create policy ht29_owner_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ht29_owner_all on public.nudge_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------------------------------- 5b · app config
-- Settings the whole app shares and nobody edits from the app: today only `google_client_id`, which turns
-- on "Connect Google Drive" (paste 133 S6.23). A signed-in person may read it; only the owner of the
-- database writes it (the SQL editor, or ht29_unlock.py --google-id). A browser app's client id is public.
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to authenticated;
drop policy if exists ht29_read on public.app_config;
create policy ht29_read on public.app_config for select to authenticated using (true);

-- ---------------------------------------------------------------------------------------- 6 · realtime
-- A check-off on the phone reaches the open desktop in about a second instead of at the next 30 s pull
-- (paste 133 S7.27). Realtime applies the policies above to every listener, so a person hears only rows
-- they could already read. The app still pulls every 30 s when a channel cannot open.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['days', 'day_private', 'habits'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;

-- ----------------------------------------------------------------------- what Run shows you (read only)
-- One row. standards_before = standards_after, or something is wrong - send the screenshot.
select b.standards                                           as standards_before,
       count(h.*)::int                                       as standards_after,
       count(*) filter (where h.section = 'morning')::int    as morning,
       count(*) filter (where h.section = 'night')::int      as night,
       count(*) filter (where h.section = 'standards')::int  as standards,
       count(*) filter (where h.section = 'weekly')::int     as weekly,
       (select count(*)::int from pg_policies p where p.schemaname = 'public'
          and p.tablename = 'day_private' and p.policyname not like 'ht29\_%') as journal_policies_not_owner_only
  from ht29_before b
  left join public.habits h on true
 group by b.standards;

-- AND THE SWITCH ITSELF, printed rather than assumed: every one of these must read true. A table with RLS off
-- is a table anyone with the shipped key can read, and until this grid existed nothing said so out loud.
select c.relname as "table", c.relrowsecurity as "rls on",
       (select b.was_enabled from public.ht29_rls_backup b where b.tablename = c.relname) as "rls before"
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('day_private', 'profile_private', 'habits', 'days', 'profiles', 'circles', 'circle_members')
 order by 1;

-- ONE LINE REVERSES THE RATING NUMBER (paste 133 Ruling 4 - "Cory reverses in one word"):
--   revoke execute on function public.ht29_circle_ratings(date, date) from authenticated;
