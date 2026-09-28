-- 2026-09-28_ht293_rls_rollback.sql - the undo for 2026-09-28_ht293_rls.sql (WIRE HT-293).
-- Switches row level security back OFF on exactly the tables that file switched on (public.ht293_rls_log), and on
-- nothing else. The log itself is kept (DEC-037). Safe to run twice; a no-op when the fix changed nothing.

begin;

do $ht293b$
declare r record;
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ht293_rls_log') then
    raise notice 'HT-293 rollback: no log - the fix never ran, nothing to undo';
    return;
  end if;
  for r in select table_name from public.ht293_rls_log loop
    execute format('alter table public.%I disable row level security', r.table_name);
    raise notice 'HT-293 rollback: row level security switched OFF again for public.%', r.table_name;
  end loop;
end
$ht293b$;

commit;
