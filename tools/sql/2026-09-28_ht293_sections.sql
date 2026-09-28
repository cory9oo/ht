-- 2026-09-28_ht293_sections.sql - WIRE HT-293 (paste 293 S1, Cory 2026-09-28 09:23): SCHEDULED · WEEKLY · STANDARDS,
-- and the per-task "Show on Sabbath".
--
-- WHAT IT DOES, AND NOTHING ELSE:
--   1. habits.section admits `scheduled` beside the four it admits today. The legacy values stay LEGAL, so a
--      phone still on an older build can save; the app reads morning · night · anytime · null as Scheduled.
--   2. Stored `morning` and `night` become `scheduled`, in place. Idempotent: a second run matches no row.
--      ORDER MATTERS: the BEV vault copier (tools/copiers/_ht.py, the BEV lane's) reads `morning`/`night` today;
--      it must learn `scheduled` before this runs, or the vault note files Scheduled tasks under Standards
--      (cosmetic, and reversed by the rollback). The app and the nudge sender already read it.
--   3. habits.show_on_sabbath boolean not null default false - the per-task switch. Until this runs the app keeps
--      it on the device (localStorage ht293_sab_show) and says nothing is lost.
--
-- SAFE TO RUN TWICE. It REFUSES rather than half-applying: row level security off on `habits` stops it before
-- the first statement (the ht_pending.sql contract). Undo: 2026-09-28_ht293_sections_rollback.sql beside it.

do $ht293s$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'habits') then
    raise exception 'HT-293: public.habits does not exist - nothing was applied';
  end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'habits' and rowsecurity) then
    raise exception 'HT-293: row level security is OFF on public.habits - refusing to change an unprotected table';
  end if;
end
$ht293s$;

begin;

alter table public.habits add column if not exists section text;
alter table public.habits drop constraint if exists habits_section_ht29;
alter table public.habits drop constraint if exists habits_section_ht293;
alter table public.habits add constraint habits_section_ht293
  check (section is null or section in ('scheduled', 'weekly', 'standards', 'morning', 'night'));

-- DEC-037: the value it had is KEPT beside it, so the rollback puts back morning and night exactly
alter table public.habits add column if not exists section_before_ht293 text;
update public.habits
   set section_before_ht293 = section
 where section in ('morning', 'night') and section_before_ht293 is null;
update public.habits
   set section = 'scheduled'
 where section in ('morning', 'night');

alter table public.habits add column if not exists show_on_sabbath boolean not null default false;

commit;

-- ---- UNDO (build_pending.py un-comments this into ht_pending_rollback.sql; the same as the rollback file) ----
--   begin;
--   update public.habits set section = section_before_ht293
--    where section = 'scheduled' and section_before_ht293 in ('morning', 'night');
--   update public.habits set section = 'morning' where section = 'scheduled';
--   alter table public.habits drop constraint if exists habits_section_ht293;
--   alter table public.habits drop constraint if exists habits_section_ht29;
--   alter table public.habits add constraint habits_section_ht29
--     check (section is null or section in ('morning', 'night', 'standards', 'weekly'));
--   commit;
-- (show_on_sabbath and section_before_ht293 are KEPT - DEC-037)
