-- 2026-09-24_ht209_silence_rollback.sql - the undo for 2026-09-24_ht209_silence.sql.
--
-- Sets the "Silence" row's section back to null, but ONLY where it still reads 'night' - so if Cory has
-- since moved it somewhere else, this leaves that placement alone. Safe to run twice.

begin;

update public.habits
   set section = null
 where id = 'fe4dfda1-efb7-4cbb-bae2-b24af5c75794'
   and section = 'night';

commit;
