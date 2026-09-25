-- 2026-09-24_ht209_silence.sql - WIRE HT-209 (paste 209 S2c): ONE ROW, ONCE.
--
-- Cory's "Silence" standard has an empty `section` on the server; his own list puts it under Night.
-- Every other active row already carries the section he placed it in (22 of 23 at writing). This is a
-- DATA fix for the single row, not a schema change.
--
-- SAFE TO RUN TWICE: the second run matches no row and updates 0 (the `section` is no longer null/empty).
-- SCOPED TO ONE ID: no other row can match, so this cannot move anything Cory placed himself.
-- REVERSIBLE: the undo is 2026-09-24_ht209_silence_rollback.sql beside this file - it sets the section
--   back to null ONLY where it still reads 'night', so it never clobbers a later placement he made.
--
-- Run through the machine route (tools/MIGRATION_ROUTE.md), which resolves its own connection by target
-- name (BEV/HT_SUPABASE_DB_URL, R70.333) under this paste's --db live-writer lease. It opens, prints and
-- moves no key. FIRST run must update exactly 1 row; a SECOND must update 0.

begin;

update public.habits
   set section = 'night'
 where id = 'fe4dfda1-efb7-4cbb-bae2-b24af5c75794'
   and (section is null or section = '');

commit;
