-- 2026-09-28_ht293_rls_audit.sql - WIRE HT-293 (paste 293 S4.1): THE PRIVACY AUDIT, READ-ONLY.
-- Cory 2026-09-28 09:31: "as long as our data is secure and not seen by the public they can use the app".
-- It changes nothing. Run it in Supabase -> SQL Editor (or by tools/sql/apply_pending.py's route with the key) and
-- read the one table it prints: every table in schema public, whether row level security is on (and forced), how
-- many policies it has per verb, and a verdict:
--   PASS      RLS on, every policy keyed to auth.uid() or to a membership helper, no `using (true)`
--   FAIL      RLS off, or a policy that is true for everyone, or a journal table with any non-owner policy
--   CHECK     policies exist but their text names neither auth.uid() nor a membership helper - read them
-- The journal is `day_private` (brain dump, completed, prayer, the rating's why): owner-only on every verb.

with t as (
  select c.oid, c.relname as tbl, c.relrowsecurity as rls, c.relforcerowsecurity as forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
), p as (
  select tablename as tbl, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as txt, roles
    from pg_policies where schemaname = 'public'
)
select t.tbl as "table",
       t.rls as "rls on",
       t.forced as "forced",
       (select count(*) from p where p.tbl = t.tbl and p.cmd in ('SELECT', 'ALL')) as "select",
       (select count(*) from p where p.tbl = t.tbl and p.cmd in ('INSERT', 'ALL')) as "insert",
       (select count(*) from p where p.tbl = t.tbl and p.cmd in ('UPDATE', 'ALL')) as "update",
       (select count(*) from p where p.tbl = t.tbl and p.cmd in ('DELETE', 'ALL')) as "delete",
       case
         when not t.rls then 'FAIL - row level security is off'
         -- PUBLIC CONFIG, BY DESIGN: app_config holds the tracker's public Google client id (HT-29 S6.23); a signed-in
         -- person may READ it (ht29_read). Readable-when-signed-in on that table only, and SELECT only, is a PASS.
         when t.tbl = 'app_config' and not exists (select 1 from p where p.tbl = t.tbl and p.cmd <> 'SELECT')
              and exists (select 1 from p where p.tbl = t.tbl and btrim(p.txt) in ('true', 'true true'))
           then 'PASS - public config, readable when signed in (select only)'
         when exists (select 1 from p where p.tbl = t.tbl and btrim(p.txt) in ('true', 'true true'))
           then 'FAIL - a policy is true for everyone'
         when t.tbl in ('day_private') and exists (select 1 from p where p.tbl = t.tbl and p.txt !~* 'auth\.uid\(\)')
           then 'FAIL - the journal has a policy that is not owner-only'
         when t.tbl in ('day_private') and exists (select 1 from p where p.tbl = t.tbl and p.txt ~* 'circle|member')
           then 'FAIL - the journal has a group policy'
         when exists (select 1 from p where p.tbl = t.tbl and p.txt !~* 'auth\.uid\(\)|ht29_in_circle|ht29_shares_circle')
           then 'CHECK - a policy names neither auth.uid() nor a membership helper'
         when not exists (select 1 from p where p.tbl = t.tbl) then 'PASS - RLS on, no policy: nobody but the owner role'
         else 'PASS'
       end as verdict
  from t
 order by (case when t.rls then 1 else 0 end), t.tbl;
