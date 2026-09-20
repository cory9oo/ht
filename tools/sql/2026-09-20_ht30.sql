-- ============================================================================================
-- HT-30 (PASTE 137) . ONE COLUMN, SO A SABBATH FOLLOWS THE PERSON AND NOT THE DEVICE
-- WIRE HT-30 . Sunday 2026-09-20 . run it whole, in Supabase -> SQL Editor -> New query -> Run.
--
-- WHAT IT DOES, AND NOTHING ELSE:
--   profile_private.sabbath_dow smallint null   -- 0 Sunday .. 6 Saturday, NULL = no Sabbath kept
--
-- The app works before and after this runs (it probes the column the way it probes `cue`,
-- `target_age`, `notes` and `section`). Until it exists the choice is kept on the device and
-- Settings says so in one line. Nothing else changes: no policy, no grant, no other table.
--
-- SAFE TO RUN TWICE. One transaction. It REFUSES rather than half-applying if row level security
-- is off on the table it touches - the same contract 2026-09-15_ht29.sql ships with, and for the
-- same reason: a private column on an unprotected table is worse than no column at all.
-- Undo is at the foot of this file, commented out.
-- ============================================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profile_private') then
    raise exception 'HT-30: public.profile_private does not exist - run 2026-09-15_ht29.sql first';
  end if;
  if not exists (select 1 from pg_tables
                 where schemaname = 'public' and tablename = 'profile_private' and rowsecurity) then
    raise exception 'HT-30: row level security is OFF on public.profile_private - refusing to add a private column to an unprotected table';
  end if;
end $$;

alter table public.profile_private
  add column if not exists sabbath_dow smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_private_sabbath_dow_ck') then
    alter table public.profile_private
      add constraint profile_private_sabbath_dow_ck
      check (sabbath_dow is null or (sabbath_dow between 0 and 6));
  end if;
end $$;

comment on column public.profile_private.sabbath_dow is
  'HT-30 (Cory 2026-09-20): the day of week this person keeps as a Sabbath, 0=Sunday..6=Saturday. '
  'NULL means none is kept - the default for every account. On that day the list shows the Sabbath '
  'check-off alone; DEC-172''s weight arithmetic is untouched.';

commit;

-- ---- UNDO ----------------------------------------------------------------------------------
-- The column holds one person's answer to one question, so dropping it loses that answer and
-- nothing else; the app falls straight back to keeping it on the device.
--
--   begin;
--   alter table public.profile_private drop constraint if exists profile_private_sabbath_dow_ck;
--   alter table public.profile_private drop column if exists sabbath_dow;
--   commit;
