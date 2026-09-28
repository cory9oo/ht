-- 2026-09-28_ht293_sections_rollback.sql - the undo for 2026-09-28_ht293_sections.sql (WIRE HT-293).
-- Puts morning and night back EXACTLY (from section_before_ht293), restores HT-29's four-value constraint, and
-- leaves both added columns in place: a rollback never deletes data (DEC-037). The app reads the old values as
-- Scheduled either way. Safe to run twice.

begin;

update public.habits
   set section = section_before_ht293
 where section = 'scheduled' and section_before_ht293 in ('morning', 'night');
update public.habits
   set section = 'morning'
 where section = 'scheduled';

alter table public.habits drop constraint if exists habits_section_ht293;
alter table public.habits drop constraint if exists habits_section_ht29;
alter table public.habits add constraint habits_section_ht29
  check (section is null or section in ('morning', 'night', 'standards', 'weekly'));

-- kept on purpose (DEC-037):
--   habits.show_on_sabbath        the per-task switch the person set
--   habits.section_before_ht293   the value each row had before the rewrite

commit;
