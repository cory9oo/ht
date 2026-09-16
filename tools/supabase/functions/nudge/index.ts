// nudge/index.ts - the evening nudge's sender, a Supabase Edge Function (WIRE HT-29, paste 133 S9.31).
//
//   GET  /functions/v1/nudge?vapid=1   -> { publicKey }            the app asks before it subscribes
//   POST /functions/v1/nudge  {test:true}   Authorization: the person's session -> one nudge to their devices
//   POST /functions/v1/nudge  {sweep:true}  x-ht29-cron: <CRON_SECRET>          -> every due person, now
//
// DEPLOYED UNARMED. Deploying it sends nothing. A sweep happens only when the schedule in
// tools/sql/2026-09-15_ht29_arm.sql calls it, and that file is run only after Cory says "arm" (R70.344).
// Deploy with --no-verify-jwt: the schedule carries CRON_SECRET, and a test call is checked against the
// person's own session below.
//
// Secrets (Supabase -> Edge Functions -> Secrets; set by tools/nudge_unlock.py):
//   VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · CRON_SECRET          (SUPABASE_URL + SERVICE_ROLE_KEY are built in)
// What it reads, with the service role: nudge_prefs, push_subscriptions, habits (id, name, section, cadence,
// times, active), days (checked, active_set), day_private.rating ONLY, profiles.display_name, circle_members.
// It never selects a journal column.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { localParts, sweep, compose, counts } from './core.js';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUB = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const PRIV = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const CRON = Deno.env.get('CRON_SECRET') || '';
const APP = 'https://cory9oo.github.io/ht/';
const CORS = { 'Access-Control-Allow-Origin': APP.replace(/\/ht\/$/, ''), 'Access-Control-Allow-Headers': 'authorization, content-type',
               'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
if (PUB && PRIV) webpush.setVapidDetails(APP, PUB, PRIV);

const HABIT_COLS = 'id,user_id,name,group_name,section,cadence,planned_start,time_anchor,active';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function load(userIds: string[], dates: string[]) {
  const byUser: Record<string, any> = {};
  for (const id of userIds) byUser[id] = { habits: [], days: {}, ratings: {}, name: 'member' };
  if (!userIds.length) return byUser;
  const [h, d, r, p] = await Promise.all([
    db.from('habits').select(HABIT_COLS).in('user_id', userIds),
    db.from('days').select('user_id,date,checked,active_set').in('user_id', userIds).in('date', dates),
    db.from('day_private').select('user_id,date,rating').in('user_id', userIds).in('date', dates),
    db.from('profiles').select('id,display_name').in('id', userIds),
  ]);
  for (const res of [h, d, r, p]) if (res.error) throw new Error(res.error.message);
  for (const x of h.data!) byUser[x.user_id].habits.push(x);
  for (const x of d.data!) byUser[x.user_id].days[x.date] = x;
  for (const x of r.data!) byUser[x.user_id].ratings[x.date] = x.rating;
  for (const x of p.data!) byUser[x.id].name = x.display_name || 'member';
  return byUser;
}

async function comembers(userIds: string[]) {
  const mine = await db.from('circle_members').select('circle_id,user_id').in('user_id', userIds);
  if (mine.error) throw new Error(mine.error.message);
  const circles = [...new Set(mine.data!.map((m) => m.circle_id))];
  if (!circles.length) return {};
  const all = await db.from('circle_members').select('circle_id,user_id').in('circle_id', circles);
  if (all.error) throw new Error(all.error.message);
  const out: Record<string, string[]> = {};
  for (const me of userIds) {
    const my = new Set(mine.data!.filter((m) => m.user_id === me).map((m) => m.circle_id));
    out[me] = [...new Set(all.data!.filter((m) => my.has(m.circle_id) && m.user_id !== me).map((m) => m.user_id))];
  }
  return out;
}

async function send(userId: string, message: { title: string; body: string }) {
  const subs = await db.from('push_subscriptions').select('endpoint,p256dh,auth_key').eq('user_id', userId);
  if (subs.error) throw new Error(subs.error.message);
  let sent = 0, gone = 0, failed = 0;
  for (const s of subs.data!) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify({ ...message, url: APP }), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {                       // the device unsubscribed: forget it
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        gone++;
      } else {
        failed++;
        console.error('push failed', code || (e as Error).name);  // never the endpoint, never the body
      }
    }
  }
  return { sent, gone, failed };
}

async function runSweep(now: Date) {
  const prefs = await db.from('nudge_prefs').select('user_id,enabled,noon,evening,on_sabbath,tz,last_sent').eq('enabled', true);
  if (prefs.error) throw new Error(prefs.error.message);
  const ids = prefs.data!.map((p) => p.user_id);
  const cm = await comembers(ids);
  const everyone = [...new Set([...ids, ...Object.values(cm).flat()])];
  const dates = [...new Set(prefs.data!.map((p) => localParts(now, p.tz).date))];
  const out = sweep(now, { prefs: prefs.data!, byUser: await load(everyone, dates), comembers: cm });
  let sent = 0, failed = 0;
  for (const m of out) {
    const r = await send(m.user_id, m.message);
    sent += r.sent;
    failed += r.failed;
    // THE STAMP IS THE RECORD OF A SEND, so it is only written when something was sent. Stamped regardless,
    // a person whose endpoints all refuse (a mismatched VAPID pair, say) is marked nudged for the day and is
    // never retried - the sweep goes quiet for them for good, and the only trace is a log line nobody reads.
    if (r.sent === 0) { console.error('nudge not delivered', m.slot, r.failed, r.gone); continue; }
    const p = prefs.data!.find((x) => x.user_id === m.user_id)!;
    const up = await db.from('nudge_prefs').update({ last_sent: { ...(p.last_sent || {}), [m.slot]: m.date } }).eq('user_id', m.user_id);
    if (up.error) console.error('last_sent not stamped', up.error.code || up.error.message);
  }
  return { due: out.length, sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('vapid')) {
    return PUB ? json({ publicKey: PUB }) : json({ error: 'not configured' }, 503);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.sweep) {
      if (!CRON || req.headers.get('x-ht29-cron') !== CRON) return json({ error: 'forbidden' }, 403);
      return json(await runSweep(new Date()));
    }
    if (body.test) {
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const who = await db.auth.getUser(token);
      if (who.error || !who.data.user) return json({ error: 'sign in' }, 401);
      const uid = who.data.user.id;
      const prefs = await db.from('nudge_prefs').select('tz').eq('user_id', uid).maybeSingle();
      const parts = localParts(new Date(), prefs.data?.tz || 'America/Chicago');
      const data = await load([uid], [parts.date]);
      const me = { day: counts(data[uid].habits, data[uid].days[parts.date] || null, parts.weekday),
                   morning: { done: 0, due: 0 }, rated: data[uid].ratings[parts.date] != null };
      return json(await send(uid, compose('evening', me, [])));
    }
    return json({ error: 'nothing asked' }, 400);
  } catch (e) {
    console.error('nudge failed', (e as Error).message);
    return json({ error: 'failed' }, 500);
  }
});
