-- 2026-09-23_ht32.sql - WIRE HT-32 (paste 148 + nudges N1-N7).
--
-- Idempotent by construction: every statement is `if not exists` / `or replace`, so running this
-- twice changes nothing. It is appended to `ht_pending.sql` by `tools/sql/build_pending.py`, which
-- puts the whole stack's RLS guard in front of it - so nothing here runs on a database whose row
-- level security is off.
--
-- WHAT IT ADDS, and which part of the paste asked for it:
--   S6.14   profiles.theme                       the picker, across devices
--   N4      profiles.mirror                      where that member's journal mirrors
--   S4.10   circle_members.reward / .consequence the stakes, free text, that member's own
--   N1      stakes_log                           every edit: who, when, before -> after
--   S4.10   profiles.report_hour / .timezone     when a member's day closes, in their zone
--   S4.8    reports                              one row per member per day, and per week
--   S2.4    circle_pending                       a member added by email before they sign in
--   S5.11   (no table)                           the cap rides HT-29's `nudge_prefs.last_sent`
--   N2      supabase_realtime                    the two tables the mirror daemon listens to
--
-- PRIVACY IS STRUCTURAL HERE, NOT A POLICY BOLTED ON (CLAUDE.md, and 143's Ruling 4). `reports`
-- carries a day's NUMBERS and a member's own stakes text, and it has no column that could hold a
-- journal line. The four private fields live in `day_private` and there is no path from this table
-- to them - not a foreign key, not a view, not a function. A report cannot leak what it cannot name.

begin;

-- ---------------------------------------------------------------- S6.14 / N4 . per-person settings
alter table public.profiles            add column if not exists theme text;
alter table public.profiles            add column if not exists mirror text default 'none';
alter table public.profiles            add column if not exists report_hour int;
alter table public.profiles            add column if not exists timezone text;

do $ht32_ck$
begin
  -- A CHECK, NOT AN ENUM. `mirror`'s values live in `standard/shared/mirrors.js` and N4's whole
  -- point is that a new renderer is a line of config - a Postgres enum would make it a migration,
  -- which is the thing N4 says must never be needed again. So the column only refuses nonsense.
  if not exists (select 1 from pg_constraint where conname = 'profiles_report_hour_ck') then
    alter table public.profiles add constraint profiles_report_hour_ck
      check (report_hour is null or (report_hour >= 0 and report_hour <= 23));
  end if;
end
$ht32_ck$;

-- ---------------------------------------------------------------- S4.10 / N1 . the stakes
alter table public.circle_members add column if not exists reward text;
alter table public.circle_members add column if not exists consequence text;

-- N1: "Every edit is logged (who, when, before -> after) and visible on the member's row; the Friday
-- report prints the text in force at week's end." A log is the only way the second half is possible:
-- without it, Friday can only print what the text says TODAY.
create table if not exists public.stakes_log (
  id          bigserial primary key,
  circle_id   uuid not null,
  member_id   uuid not null,
  field       text not null check (field in ('reward', 'consequence')),
  before_text text,
  after_text  text,
  edited_by   uuid not null,
  edited_at   timestamptz not null default now()
);
create index if not exists stakes_log_member_idx on public.stakes_log (member_id, edited_at desc);
alter table public.stakes_log enable row level security;

-- ---------------------------------------------------------------- S4.8 . the reports
create table if not exists public.reports (
  id         bigserial primary key,
  kind       text not null check (kind in ('daily', 'weekly')),
  user_id    uuid not null,
  circle_id  uuid,
  period     date not null,                   -- the day, or the week's Friday
  pct        numeric,                         -- the day's %, or the week's average
  rating     int,                             -- daily only
  streak     int,
  need_next  numeric,                         -- what tomorrow has to be
  state      text,                            -- secured | on-track | at-risk | out-of-reach
  days_met   int,                             -- weekly: days at or above target
  best_day   date,
  worst_day  date,
  outcome    text check (outcome is null or outcome in ('MET', 'MISSED')),
  stakes     text,                            -- the member's own text AS IT STOOD at period end
  compare    text,                            -- one line against the group
  created_at timestamptz not null default now(),
  unique (kind, user_id, period)              -- ONE row per member per period: the job is idempotent
);
create index if not exists reports_period_idx on public.reports (period desc, kind);
alter table public.reports enable row level security;

-- ---------------------------------------------------------------- S2.4 . a member added by email
-- The row exists BEFORE the person does. When that email signs in, `ht32_claim_pending` turns it
-- into a real membership with no further act by anybody - which is what "they appear now" means.
create table if not exists public.circle_pending (
  id         bigserial primary key,
  circle_id  uuid not null,
  email      text not null,
  added_by   uuid not null,
  added_at   timestamptz not null default now(),
  unique (circle_id, email)
);
alter table public.circle_pending enable row level security;

-- ---------------------------------------------------------------- S5.11 . one push a day
-- NO NEW TABLE. `public.push_subscriptions` (HT-29, 2026-09-15_ht29.sql) already holds one endpoint
-- per device and `app.js`'s `subscribe()` already writes to it; `public.nudge_prefs` already holds
-- `last_sent` and `dueSlot` has read it since then. A second `push_subs` table was written here and
-- REMOVED before it existed anywhere: two tables for one device address is the duplication R70.282
-- exists to delete, and the failure mode is the quiet one - the app keeps writing HT-29's table, the
-- new sender reads the new one, and every push goes to nobody with nothing to say so.
--
-- So S5's cap lands in `nudge_prefs.last_sent`, beside the two slots it already caps:
--   last_sent = {"noon": "...", "evening": "...", "report": "2026-09-23"}
-- `report_hour` and `timezone` are on `profiles` above, because they are when a PERSON's day closes -
-- the report row and the push both read them, and two answers to "when does his day end" is the same
-- mistake one layer up.

-- ---------------------------------------------------------------- N2 . the daemon's two ears
do $ht32_rt$
begin
  -- ONE IDEMPOTENT LINE, as N2 asks. `ht_daemon.py --check` names this statement verbatim when it
  -- refuses to start, so nobody has to go looking for it.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'days') then
      alter publication supabase_realtime add table public.days;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_private') then
      alter publication supabase_realtime add table public.day_private;
    end if;
  end if;
end
$ht32_rt$;

commit;

-- ==================================================================================================
-- POLICIES. Separate transaction: a policy that already exists is dropped and recreated, so this
-- block is idempotent in the way `create policy` alone is not.
-- ==================================================================================================
begin;

drop policy if exists ht32_reports_read   on public.reports;
drop policy if exists ht32_reports_owner  on public.reports;
drop policy if exists ht32_stakes_read    on public.stakes_log;
drop policy if exists ht32_pending_read   on public.circle_pending;
drop policy if exists ht32_pending_write  on public.circle_pending;

-- EVERY MEMBER SEES EVERY MEMBER'S ROWS (the 9/15 visibility ruling, S4.9) - but only inside a
-- circle they are themselves in. The subquery is the whole fence.
create policy ht32_reports_read on public.reports for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.circle_members me
                join public.circle_members them on them.circle_id = me.circle_id
               where me.user_id = auth.uid() and them.user_id = public.reports.user_id)
  );
-- WRITES ARE THE JOB'S, NOT THE CLIENT'S (S4.8: "generated by ONE server-side job ... never by the
-- client"). `authenticated` gets no insert or update here at all; the job uses the service key.
create policy ht32_reports_owner on public.reports for all to service_role using (true) with check (true);

create policy ht32_stakes_read on public.stakes_log for select to authenticated
  using (exists (select 1 from public.circle_members me
                  join public.circle_members them on them.circle_id = me.circle_id
                 where me.user_id = auth.uid() and them.user_id = public.stakes_log.member_id));

create policy ht32_pending_read on public.circle_pending for select to authenticated
  using (exists (select 1 from public.circle_members me
                 where me.user_id = auth.uid() and me.circle_id = public.circle_pending.circle_id));
-- "a pending row can be removed by whoever added it" (S2.4), and added by any member of the circle.
create policy ht32_pending_write on public.circle_pending for all to authenticated
  using (added_by = auth.uid())
  with check (exists (select 1 from public.circle_members me
                      where me.user_id = auth.uid() and me.circle_id = public.circle_pending.circle_id));

grant select on public.reports, public.stakes_log, public.circle_pending to authenticated;
grant select, insert, update, delete on public.circle_pending to authenticated;
grant usage, select on sequence public.circle_pending_id_seq to authenticated;

commit;

-- ==================================================================================================
-- THE ONE FUNCTION. A pending row becomes a membership the moment its email signs in - "with no
-- further act" (S2.4). It is SECURITY DEFINER because the person claiming has, by definition, no
-- membership yet and so cannot see the circle; it is narrow to compensate - it acts only on rows
-- whose email equals the CALLER'S OWN verified email, and it can do nothing else.
-- ==================================================================================================
create or replace function public.ht32_claim_pending()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  mine text;
  n    int := 0;
begin
  select lower(email) into mine from auth.users where id = auth.uid();
  if mine is null then
    return 0;
  end if;
  insert into public.circle_members (circle_id, user_id)
    select p.circle_id, auth.uid() from public.circle_pending p
     where lower(p.email) = mine
       and not exists (select 1 from public.circle_members m
                        where m.circle_id = p.circle_id and m.user_id = auth.uid());
  get diagnostics n = row_count;
  -- IDEMPOTENT BY THE LINK ROUTE TOO (S2.4): joining by invite link fulfils a pending row for the
  -- same email, so the row is cleared whether the membership was made here or by the link.
  delete from public.circle_pending p where lower(p.email) = mine;
  return n;
end;
$$;

revoke all on function public.ht32_claim_pending() from public;
grant execute on function public.ht32_claim_pending() to authenticated;

-- ==================================================================================================
-- THE GRID. One row, and it says whether this file did what it says.
-- ==================================================================================================
select 'ht32 columns'  as thing,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles'
           and column_name in ('theme', 'mirror', 'report_hour', 'timezone'))            as have,
       4                                                                                  as want
union all
select 'ht32 tables',
       (select count(*) from pg_tables where schemaname = 'public'
         and tablename in ('reports', 'stakes_log', 'circle_pending')), 3
union all
select 'ht32 stakes columns',
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'circle_members'
           and column_name in ('reward', 'consequence')), 2
union all
select 'ht32 realtime',
       (select count(*) from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public'
           and tablename in ('days', 'day_private')), 2
union all
select 'ht32 claim_pending',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ht32_claim_pending'), 1;
