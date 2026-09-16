-- 2026-09-15_ht29_rollback.sql - undoes 2026-09-15_ht29.sql (WIRE HT-29, paste 133).
-- Supabase -> SQL Editor -> New query -> paste -> Run. One transaction. Safe to run twice.
--
-- It puts back, exactly, the policies ht29 replaced on day_private / profile_private / habits (read from
-- ht29_policy_backup, which ht29 filled before it changed anything), and removes every policy and function
-- ht29 added. It REFUSES to run if the backup is empty - an empty backup would leave those three tables
-- with no policy at all, which blocks their own owners.
--
-- KEPT ON PURPOSE (the frozen-data rule - nothing a person wrote is lost by an undo):
--   habits.section          the places people put their standards; nullable, and ignored by an older app
--   push_subscriptions      people's devices    ·    nudge_prefs    people's nudge times
--   ht29_policy_backup      the record of what the policies were
--   the realtime publication membership of days / day_private / habits (a listener hears only rows the
--                           restored policies let it read, so leaving it costs nothing)
-- The nudge schedule, if it was ever armed, is removed by the first statement below it names.

begin;

do $$
declare r record; roles text;
begin
  if not exists (select 1 from public.ht29_policy_backup) then
    raise exception 'NO_BACKUP: ht29_policy_backup is empty - nothing to restore, nothing changed';
  end if;

  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('day_private', 'profile_private', 'habits')
              and policyname like 'ht29\_%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  for r in select * from public.ht29_policy_backup order by tablename, policyname loop
    if exists (select 1 from pg_policies p where p.schemaname = 'public'
                 and p.tablename = r.tablename and p.policyname = r.policyname) then
      continue;                                                         -- a second run: already back
    end if;
    select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ')
      into roles from unnest(r.roles) as x;
    execute format('create policy %I on public.%I as %s for %s to %s %s %s',
                   r.policyname, r.tablename, r.permissive, r.cmd, coalesce(roles, 'public'),
                   case when r.qual is null then '' else 'using (' || r.qual || ')' end,
                   case when r.with_check is null then '' else 'with check (' || r.with_check || ')' end);
  end loop;
end $$;

drop policy if exists ht29_comember_select on public.circle_members;
drop policy if exists ht29_comember_select on public.days;
drop policy if exists ht29_comember_select on public.profiles;
drop policy if exists ht29_owner_insert    on public.profiles;
drop policy if exists ht29_owner_update    on public.profiles;
drop policy if exists ht29_member_select   on public.circles;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job where jobname like 'ht29\_%';
  end if;
end $$;

drop function if exists public.ht29_join_circle(text);
drop function if exists public.ht29_member_day(uuid, date);
drop function if exists public.ht29_circle_ratings(date, date);
drop function if exists public.ht29_in_circle(uuid);
drop function if exists public.ht29_shares_circle(uuid);

-- AND ROW LEVEL SECURITY GOES BACK TO WHAT IT WAS, table by table, from the reading ht29 took before it
-- touched anything (ht29_rls_backup). Dropping a policy from a table whose RLS the migration switched on
-- would leave it enabled with no policy at all - a harder lockout than the one this file exists to undo.
do $$
declare r record;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'ht29_rls_backup') then
    raise notice 'no ht29_rls_backup: RLS left as it is (this database predates that reading)';
  else
    for r in select tablename, was_enabled from public.ht29_rls_backup order by tablename loop
      if not r.was_enabled then
        execute format('alter table public.%I disable row level security', r.tablename);
        raise notice 'RLS returned to OFF on %', r.tablename;
      end if;
    end loop;
  end if;
end $$;

commit;

select tablename, policyname, cmd from pg_policies
 where schemaname = 'public'
   and tablename in ('day_private', 'profile_private', 'habits', 'days', 'profiles', 'circles', 'circle_members')
 order by tablename, policyname;

select c.relname as "table", c.relrowsecurity as "rls on now"
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('day_private', 'profile_private', 'habits', 'days', 'profiles', 'circles', 'circle_members')
 order by 1;
