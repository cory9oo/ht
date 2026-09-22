-- 2026-09-22_ht31.sql - WIRE HT-31 (paste 143 S6.18 + S7.23): the two things HT-31 needs from the
-- database, and nothing else.
--
-- YOU DO NOT RUN THIS FILE BY ITSELF. Run `tools/sql/ht_pending.sql`, which is 29, then 30, then this,
-- in one paste - so the number of wires that have stacked up never becomes the number of things Cory
-- has to do. This file is kept separate because a wire's own changes should be readable on their own.
--
-- ONE transaction: it applies completely or not at all. SAFE TO RUN TWICE: a second run changes nothing.
-- UNDO: at the foot of this file.
--
-- WHAT CHANGES
--  1 - circles.members_can_invite (boolean, default true). Cory 9/21: "a quick link I or any other user
--      can send". Any member may invite; the group's starter can switch that off. The app reads the
--      column when it exists and behaves as `true` when it does not, so nothing waits for this.
--  2 - ht31_circle_peek(code) -> (name, members). What a person sees BEFORE they agree to join: whose
--      group it is and how many people are in it. TWO COLUMNS, and there is no third - no member names,
--      no ids, no days, nothing of anyone's journal. It answers only for a code the caller already
--      holds, which is the same secret the join itself requires.
-- No grant to anon. No row deleted. No column dropped. No policy on any table is replaced.

begin;

-- 1 ------------------------------------------------------------------------------------------
alter table public.circles add column if not exists members_can_invite boolean not null default true;

comment on column public.circles.members_can_invite is
  'HT-31 (Cory 2026-09-21): any member may send the invite link. The group''s starter can switch it '
  'off in Group settings. The app treats a missing column as true, so the feature never waits on a '
  'migration - this only makes the OFF switch possible.';

-- 2 ------------------------------------------------------------------------------------------
-- SECURITY DEFINER because `circles` is readable only by its members, and the whole point is to answer
-- someone who is NOT one yet. It is safe for exactly the reason the join is safe: the caller must
-- already hold a 128-bit code, and what comes back is a name and a count.
create or replace function public.ht31_circle_peek(code text)
returns table (name text, members integer)
language sql
security definer
set search_path = public
stable
as $$
  select c.name,
         (select count(*)::int from public.circle_members m where m.circle_id = c.id) as members
    from public.circles c
   where c.join_code = upper(btrim(code))
   limit 1;
$$;

revoke all on function public.ht31_circle_peek(text) from public, anon;
grant execute on function public.ht31_circle_peek(text) to authenticated;

commit;

-- WHAT IT LOOKS LIKE AFTERWARDS, printed rather than assumed.
select 'circles.members_can_invite' as thing,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'circles'
           and column_name = 'members_can_invite')::text as present
union all
select 'ht31_circle_peek', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public' and p.proname = 'ht31_circle_peek')::text;

-- ---- UNDO ------------------------------------------------------------------------------------
-- The column holds one group's answer to one question and the function reveals a name and a count;
-- dropping either loses nothing else, and the app falls back to "any member may invite" and to the
-- one quiet line that says the group's name is not available yet.
--
--   begin;
--   drop function if exists public.ht31_circle_peek(text);
--   alter table public.circles drop column if exists members_can_invite;
--   commit;
