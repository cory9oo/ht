-- 2026-09-28_ht293_rls.sql - WIRE HT-293 (paste 293 S4.1): THE PRIVACY FIX, FOR WHATEVER THE AUDIT FAILS.
-- Run 2026-09-28_ht293_rls_audit.sql first; this file acts only on what that audit would call FAIL, and it
-- REFUSES rather than guessing:
--   * a table with RLS OFF that HAS policies -> RLS is switched on (the owner keeps full access) and the table is
--     recorded in public.ht293_rls_log so the rollback can switch exactly those back.
--   * a table with RLS OFF and NO policy -> REFUSED by name: switching it on would lock the app out of it, and
--     the right policy is a decision, not a default.
--   * a policy that is `true` for everyone, or a non-owner policy on the journal (day_private) -> REFUSED by
--     name: dropping a policy someone wrote is a decision too. Nothing is applied when anything is refused.
-- SAFE TO RUN TWICE: a table already protected is not touched. Undo: 2026-09-28_ht293_rls_rollback.sql.

do $ht293r$
declare
  nopol text; open_ text; jrnl text; r record;
begin
  select string_agg(c.relname, ', ' order by c.relname) into nopol
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);
  select string_agg(distinct p.tablename || '.' || p.policyname, ', ') into open_
    from pg_policies p
   where p.schemaname = 'public' and btrim(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) in ('true', 'true true')
     and not (p.tablename = 'app_config' and p.cmd = 'SELECT');   -- public config by design (the audit's PASS)
  select string_agg(distinct p.policyname, ', ') into jrnl
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'day_private'
     and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) !~* 'auth\.uid\(\)';
  if nopol is not null or open_ is not null or jrnl is not null then
    raise exception 'HT-293 REFUSING, nothing applied. RLS off with no policy: %. Policies true for everyone: %. '
                    'Non-owner journal policies: %. Each is a decision - name the policy you want and run again.',
                    coalesce(nopol, 'none'), coalesce(open_, 'none'), coalesce(jrnl, 'none');
  end if;
end
$ht293r$;

begin;

create table if not exists public.ht293_rls_log (table_name text primary key, enabled_at timestamptz not null default now());
alter table public.ht293_rls_log enable row level security;          -- no policy: no client can read it

do $ht293e$
declare r record;
begin
  for r in select c.relname
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    insert into public.ht293_rls_log (table_name) values (r.relname) on conflict (table_name) do nothing;
    raise notice 'HT-293: row level security switched ON for public.%', r.relname;
  end loop;
end
$ht293e$;

commit;
