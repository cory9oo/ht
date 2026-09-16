-- 2026-09-15_ht29_arm.sql - THE SCHEDULE for the evening nudge (WIRE HT-29, paste 133 S9).
--
-- DO NOT RUN until Cory has said "arm" (R70.344, 2026-09-10: nothing is armed - no schedule, hook, cron or
-- watcher - until he says the word). Everything else in paste 133 works without this file; it only adds the
-- 15-minute call that lets the nudge function send.
--
-- BEFORE IT: 2026-09-15_ht29.sql has run, the `nudge` function is deployed, and tools/nudge_unlock.py has
-- stored the cron secret in Supabase Vault as `ht29_cron_secret` (no secret is written in this file).
-- UNDO: select cron.unschedule('ht29_nudge');   (the rollback file does it too)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'ht29_nudge';

select cron.schedule(
  'ht29_nudge',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url     := 'https://ykxxiwrjuvdvwrfweceo.supabase.co/functions/v1/nudge',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-ht29-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'ht29_cron_secret')),
      body    := '{"sweep": true}'::jsonb)
  $job$
);

select jobname, schedule, active from cron.job where jobname = 'ht29_nudge';
