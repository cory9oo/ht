/* ==========================================================================
   Habit Tracker — a ledger of the self.
   One sealed closure. Nothing reaches global scope but ST.
   ========================================================================== */
(function () {
'use strict';

var SB_URL = 'https://ykxxiwrjuvdvwrfweceo.supabase.co';
var SB_KEY = 'sb_publishable_ZMRDhEgkKSnbuntc_y_xDA_QirkAxoC';   /* public by design — every table sits behind RLS */

var sb = (window.__MOCK_SB) || window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
window.ST = { sb: sb };

var WD    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var WD2   = ['S','M','T','W','T','F','S'];
var MO    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var GRADE = [[97,'A+',5],[90,'A',4],[80,'B',3],[70,'C',2],[60,'D',1],[0,'F',0]];
var SKINS = ['statement','carbon','terminal','blueprint'];
/* KPI BAND config — lead measures are DERIVED from GOAL MATH (x32), never hand-picked,
   and HELD by R35.7 until GOAL_MATH.md locks. Ships dark; hard-codes no trio. */
var HT_KPI = { enabled:false, source:'GOAL_MATH.md — not yet locked', measures:[] };

var S = {
  me:null, priv0:null, habits:[], days:[], byDate:{},
  date:null, priv:null, privAll:{},
  sort:'order', grp:'all', find:'', removed:[], circle:null, hasCue:true, view:null, yearY:null,
  hasPredict:true,
  calYM:null, calMode:'pct'
};

/* ============================ helpers ============================ */
function el(i){ return document.getElementById(i); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dk(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dnum(k){ return new Date(k+'T12:00:00'); }
function today(){ return dk(new Date()); }
function shift(k,n){ var d=dnum(k); d.setDate(d.getDate()+n); return dk(d); }
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function fmt(m){ m=Math.round(m||0); if(!m) return '—';
  var h=Math.floor(m/60), r=m%60; return h? (h+'h'+(r?' '+r+'m':'')) : (r+'m'); }
function grade(p){ if(p==null) return ['—',null];
  for(var i=0;i<GRADE.length;i++) if(p>=GRADE[i][0]) return [GRADE[i][1],GRADE[i][2]];
  return ['F',0]; }
function gcol(p){ var g=grade(p); return g[1]==null?'var(--rule2)':'var(--g'+g[1]+')'; }
/* fills read as density, linear in the percentage, so 45 and 65 are not the same colour */
function dens(p){
  if(p==null) return 'var(--sunk)';
  var t=Math.round(8+clamp(p,0,100)*0.92);
  return 'color-mix(in srgb, var(--accent) '+t+'%, var(--sunk))';
}
/* HT-16 S6: postgres `time` comes back as HH:MM:SS; the row prefix and the <input type=time>
   both want HH:MM, and a null must stay a null rather than becoming the string "null". */
function hhmm(t){
  if(t==null||t==='') return null;
  var m=String(t).match(/^(\d{1,2}):(\d{2})/);
  return m? (('0'+m[1]).slice(-2)+':'+m[2]) : null;
}
function minsOf(t){ var v=hhmm(t); if(!v) return null;
  return (+v.slice(0,2))*60 + (+v.slice(3,5)); }
function fmtHM(m){ if(m==null) return '\u2014'; m=Math.max(0,Math.round(m));
  var h=Math.floor(m/60), r=m%60; return h? (h+'h'+(r?' '+r+'m':'')) : (r+'m'); }
function toast(t){ var n=el('toast'); n.textContent=t; n.classList.add('on');
  clearTimeout(toast._t); toast._t=setTimeout(function(){ n.classList.remove('on'); },1500); }

/* Habit names carry clock prefixes. The list is no longer ordered by time,
   so the prefix is dead weight on every row — strip it for display only. */
function label(n){
  return String(n||'')
    .replace(/^\s*\d{1,2}(:\d{2})?\s*(am|pm)?\s*(?:[-–—]\s*\d{1,2}(:\d{2})?\s*(am|pm)?)?\s*/i,'')
    .replace(/\s+/g,' ').trim() || String(n||'');
}
/* Retained only for the "next up" marker — the clock still exists in the data. */
function startMin(n){
  var m=String(n||'').match(/^\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if(!m) return null;
  var h=+m[1], mi=+m[2], ap=(m[3]||'').toLowerCase();
  if(ap==='pm'&&h<12) h+=12; if(ap==='am'&&h===12) h=0;
  if(!ap && h<5) h+=12;
  return h*60+mi;
}
function skin(s){
  if(SKINS.indexOf(s)<0) s='statement';
  document.documentElement.setAttribute('data-skin',s);
  try{ localStorage.setItem('st.skin',s); }catch(e){}
  var m=document.querySelector('meta[name=theme-color]');
  if(m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()||'#F4F3EF');
  paintSkins();
}
function paintSkins(){
  var cur=document.documentElement.getAttribute('data-skin')||'statement';
  el('skins').innerHTML = SKINS.map(function(s){
    return '<button class="sw" data-skin="'+s+'" aria-pressed="'+(s===cur)+'" title="'+s+'" '+
      'style="background:'+skinSwatch(s)+'"></button>';
  }).join('');
}
function skinSwatch(s){
  return { statement:'#F4F3EF', carbon:'#0F1012', terminal:'#0A0A08', blueprint:'#0B1220' }[s];
}

/* ============================ selectors ============================ */
function daily(){ return S.habits.filter(function(h){ return h.cadence!=='weekly'; }); }
function weekly(){ return S.habits.filter(function(h){ return h.cadence==='weekly'; }); }
function ckOf(k){ var r=S.byDate[k]; return (r&&r.checked)||{}; }
function pctOf(ck,ids){ if(!ids||!ids.length) return 0; var n=0;
  for(var i=0;i<ids.length;i++) if(ck[ids[i]]) n++;
  return Math.round(n/ids.length*100); }
function weekDone(hid,k){
  var d=dnum(k), mon=new Date(d); mon.setDate(d.getDate()-((d.getDay()+6)%7));
  for(var i=0;i<7;i++){ var c=new Date(mon); c.setDate(mon.getDate()+i);
    if(c>d) break; if(ckOf(dk(c))[hid]) return true; }
  return false;
}
function doneOn(h,k){ return h.cadence==='weekly' ? weekDone(h.id,k) : !!ckOf(k)[h.id]; }
function rolling(n,upto){
  var end=upto||today(), a=[];
  for(var i=n-1;i>=0;i--){ var k=shift(end,-i), r=S.byDate[k];
    if(r&&r.pct!=null&&k<=today()) a.push(r.pct); }
  if(!a.length) return null;
  return Math.round(a.reduce(function(x,y){return x+y;},0)/a.length);
}
function committed(){ return daily().reduce(function(t,h){ return t+(h.minutes||0); },0); }
function remaining(k){
  var ck=ckOf(k);
  return daily().reduce(function(t,h){ return t+(ck[h.id]?0:(h.minutes||0)); },0);
}
function currentStreak(){
  var n=0,k=today();
  if(!S.byDate[k]||S.byDate[k].pct==null||S.byDate[k].pct<80) k=shift(k,-1);
  while(S.byDate[k]&&S.byDate[k].pct!=null&&S.byDate[k].pct>=80){ n++; k=shift(k,-1); }
  return n;
}
function dates(){ return S.days.map(function(d){return d.date;}).filter(function(k){return k<=today();}).sort(); }

/* ============================ data ============================ */
async function load(){
  var u=(await sb.auth.getUser()).data.user;
  if(!u){ authScreen(); return false; }
  var uid=u.id;
  var p  = await sb.from('profiles').select('id,display_name,handle').eq('id',uid).maybeSingle();
  /* HT-13 B1: `target_age` is optional until its migration lands. Probe widest first, then step
     down — the same contract as habits.cue and day_private.predict / brain_dump. */
  var pp = await sb.from('profile_private').select('birth_date,target_age').eq('id',uid).maybeSingle();
  if(pp.error){ S.hasTargetAge=false;
    pp = await sb.from('profile_private').select('birth_date').eq('id',uid).maybeSingle();
  } else { S.hasTargetAge=true; }
  S.me = p.data || { id:uid, display_name:(u.email||'').split('@')[0], handle:null };
  S.me.id = uid; S.me.email = u.email;
  S.priv0 = pp.data || {};

  /* `cue` may not exist yet (its migration is Cory's to run). Probe, then degrade —
     the same build must work before and after the column lands. */
  var HCOLS='id,name,group_name,cadence,tier,minutes,link,sort_order';
  var h = await sb.from('habits').select(HCOLS+',cue')
    .eq('user_id',uid).eq('active',true).order('sort_order');
  if(h.error){
    S.hasCue=false;
    h = await sb.from('habits').select(HCOLS)
      .eq('user_id',uid).eq('active',true).order('sort_order');
  } else { S.hasCue=true; }
  S.habits = (h.data||[]).map(function(x,i){ if(x.sort_order==null) x.sort_order=i; return x; });

  /* HT-13 G2: probe `closed_at` the way `cue` and `predict` are probed, then degrade. The column is
     live as of 2026-09-07, but the same build must run against a database that does not have it. */
  var DCOLS='date,checked,active_set,pct,floor_pct';
  var d = await sb.from('days').select(DCOLS+',closed_at').eq('user_id',uid).order('date');
  if(d.error){ S.hasClosedAt=false;
    d = await sb.from('days').select(DCOLS).eq('user_id',uid).order('date');
  } else { S.hasClosedAt=true; }
  S.days = d.data||[];
  S.byDate = {}; S.days.forEach(function(r){ S.byDate[r.date]=r; });
  if(!S.date) S.date = today();
  if(!S.byDate[S.date]) S.byDate[S.date]={ date:S.date, checked:{}, pct:0 };
  if(!S.calYM){ var t=dnum(today()); S.calYM=[t.getFullYear(),t.getMonth()]; }

  /* the whole private record — rating and journal are inputs, so they get outputs */
  /* `predict` may not exist yet (its migration is Cory's to run) — probe, then degrade. */
  var PVCOLS='date,rating,why,tasks,prayer';
  /* HT-10: two optional columns now. Probe widest first and step down, so the app runs whether or not
     either migration has been applied — the same degrade-cleanly contract `predict` already had. */
  var pv = await sb.from('day_private').select(PVCOLS+',predict,brain_dump').eq('user_id',uid);
  if(!pv.error){ S.hasPredict=true; S.hasDump=true; }
  else {
    pv = await sb.from('day_private').select(PVCOLS+',predict').eq('user_id',uid);
    if(!pv.error){ S.hasPredict=true; S.hasDump=false; }
    else {
      pv = await sb.from('day_private').select(PVCOLS+',brain_dump').eq('user_id',uid);
      if(!pv.error){ S.hasPredict=false; S.hasDump=true; }
      else { S.hasPredict=false; S.hasDump=false;
             pv = await sb.from('day_private').select(PVCOLS).eq('user_id',uid); }
    }
  }
  S.privAll = {}; (pv.data||[]).forEach(function(r){ S.privAll[r.date]=r; });
  S.priv = S.privAll[S.date] || null;
  return true;
}
function loadPriv(){ S.priv = S.privAll[S.date] || null; return Promise.resolve(); }
var saveT=null;
function queueSave(){ clearTimeout(saveT); saveT=setTimeout(saveDay,450); }

var pvT=null;
function queuePriv(){ clearTimeout(pvT); pvT=setTimeout(savePriv,700); }
async function savePriv(){
  var p = S.priv || (S.priv={});
  p.date=S.date; p.user_id=S.me.id;
  S.privAll[S.date]=p;
  var res = await sb.from('day_private').upsert({
    user_id:S.me.id, date:S.date,
    rating:(p.rating==null?null:p.rating), why:p.why||'', tasks:p.tasks||'', prayer:p.prayer||''
  , brain_dump:(S.hasDump ? (p.brain_dump||'') : undefined)
  },{ onConflict:'user_id,date' });
  if(res.error) toast('note not saved'); else toast('saved');
  var n=0; ['brain_dump','tasks','prayer'].forEach(function(k){ if(p[k]) n++; });
  el('jrnC').textContent = n? n+' of 3 written · autosaves' : 'saves as you type';
  paintRating(); paintRChart(); paintRScat(); paintRByMo(); paintJournal(); paintCal();
}
function ratingOf(k){ var p=S.privAll[k]; var v=p&&p.rating; return (v==null||v==='')?null:+v; }
function rollRate(n,upto){
  var end=upto||today(), a=[];
  for(var i=n-1;i>=0;i--){ var v=ratingOf(shift(end,-i)); if(v!=null) a.push(v); }
  if(!a.length) return null;
  return Math.round(a.reduce(function(x,y){return x+y;},0)/a.length*10)/10;
}
/* HT-13 G2 · `closed_at` is written HERE and only on an explicit close.
   HT-10 shipped CLOSE THE DAY and the column landed after it, so the write was never wired: measured
   non-null on 0 of 15 days. `opts.close` is passed by the button and by nothing else — an autosave
   must never stamp a day as closed, or the column stops meaning "you finished". Re-closing UPDATES
   rather than duplicating, because the upsert already conflicts on (user_id,date).
   `S.hasClosedAt` is probed in load(): a missing column would fail the whole upsert and silently
   stop the day from saving at all, which is a far worse bug than a missing timestamp. */
async function saveDay(opts){
  var r=S.byDate[S.date], ids=daily().map(function(h){return h.id;});
  r.pct = pctOf(r.checked||{}, ids);
  var row = { user_id:S.me.id, date:S.date, checked:r.checked||{}, active_set:ids, pct:r.pct };
  if(opts && opts.close && S.hasClosedAt){
    row.closed_at = new Date().toISOString();
    r.closed_at = row.closed_at;
  }
  var res = await sb.from('days').upsert(row,{ onConflict:'user_id,date' });
  if(res.error) toast('not saved');
  return res;
}

/* ============================ paint: masthead ============================ */
function paintMast(){
  var d=dnum(S.date), t=(S.date===today());
  el('mDate').textContent = WD[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate()+(t?'':' · logging back');
  var r=S.byDate[S.date]||{}, ids=daily().map(function(h){return h.id;});
  var pct=pctOf(r.checked||{},ids), g=grade(pct);
  var wk=weekly(), wkDone=wk.filter(function(h){return weekDone(h.id,S.date);}).length;
  var r7=rolling(7), r30=rolling(30), r90=rolling(90);
  var com=committed(), rem=remaining(S.date);
  var st=currentStreak();
  var done=ids.filter(function(i){return (r.checked||{})[i];}).length;

  el('tape').innerHTML =
    tp('Today', '<span style="color:'+gtxt(pct)+'">'+pct+'%</span><s>'+g[0]+'</s>') +
    tp('Done',  done+'<s>of '+ids.length+'</s>') +
    tp('Earned today', fmt(com-rem)+'<s>of '+fmt(com)+'</s>') +
    tp('7-day',  (r7==null?'—':r7+'%')+'<s>'+(r7==null?'':grade(r7)[0])+'</s>') +
    tp('30-day', (r30==null?'—':r30+'%')) +
    tp('90-day', (r90==null?'—':r90+'%')) +
    tp('Consistency', (function(){ var c=consistency(90);
        return c.pct+'%<s>'+c.hit+' of 90 d at 80%+</s>'; })()) +
    tp('Streak', (function(){ var f=streakShowedUp();
        return f.days+'<s>d logged'+(f.frozen?(' · '+f.frozen+' frozen'):'')+'</s>'; })()) +
    tp('Weekly', wkDone+'<s>of '+wk.length+'</s>') +
    tp('Rating', (function(){ var r=rollRate(7); return (r==null?'—':r)+'<s>7d avg</s>'; })()) +
    tp('Logged', dates().length+'<s>days</s>') +
    tp('Gaps', (function(){ var g=gaps(30);
        return g.missed+'<s>of last 30 d</s>'; })());
}
function tp(k,v){ return '<div class="tp"><div class="k">'+k+'</div><div class="v num">'+v+'</div></div>'; }

/* ============================ paint: rail ============================ */
function paintRail(){
  var h='';
  for(var i=13;i>=0;i--){
    var k=shift(today(),-i), d=dnum(k), r=S.byDate[k];
    var p=(r&&r.pct!=null)?r.pct:null;
    h+='<button data-d="'+k+'" class="'+(k===S.date?'sel':'')+'">'+
       '<div class="wd">'+WD[d.getDay()]+'</div><div class="dd num">'+d.getDate()+'</div>'+
       '<div class="pip" style="background:'+(p==null?'var(--rule2)':dens(p))+'"></div></button>';
  }
  el('rail').innerHTML=h;
  var n=el('rail'), s=n.querySelector('.sel');
  if(s && n.scrollWidth>n.clientWidth+4) s.scrollIntoView({block:'nearest',inline:'center'});
}

/* ============================ paint: the log ============================ */
function adherence30(hid){
  var h=S.habits.filter(function(x){return x.id===hid;})[0]; if(!h) return null;
  var n=0,t=0;
  for(var i=0;i<30;i++){
    var k=shift(today(),-i); if(!S.byDate[k]) continue;
    t++; if(doneOn(h,k)) n++;
  }
  return t? Math.round(n/t*100) : null;
}
function nextId(){
  if(S.date!==today()) return null;
  var now=new Date(), m=now.getHours()*60+now.getMinutes(), ck=ckOf(S.date);
  var best=null,bd=1e9;
  daily().forEach(function(h){
    if(ck[h.id]) return;
    var s=startMin(h.name); if(s==null) return;
    var d=Math.abs(s-m); if(s<=m+15 && d<bd){ bd=d; best=h.id; }
  });
  return best;
}
function paintLog(){
  var ck=ckOf(S.date), nx=nextId(), q=S.find.toLowerCase();
  var list=S.habits.slice();

  if(q) list=list.filter(function(h){ return (h.name+' '+(h.group_name||'')).toLowerCase().indexOf(q)>=0; });
  if(S.grp==='daily')  list=list.filter(function(h){ return h.cadence!=='weekly'; });
  if(S.grp==='weekly') list=list.filter(function(h){ return h.cadence==='weekly'; });

  if(S.sort==='order')  list.sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='undone') list.sort(function(a,b){
    var da=doneOn(a,S.date)?1:0, db=doneOn(b,S.date)?1:0;
    return da-db || (a.sort_order||0)-(b.sort_order||0); });
  if(S.sort==='weak')   list.sort(function(a,b){
    var aa=adherence30(a.id), ba=adherence30(b.id);
    return (aa==null?101:aa)-(ba==null?101:ba); });
  if(S.sort==='heavy')  list.sort(function(a,b){ return (b.minutes||0)-(a.minutes||0); });
  if(S.sort==='az')     list.sort(function(a,b){ return label(a.name).toLowerCase()<label(b.name).toLowerCase()?-1:1; });

  el('log').className = 'log'+(list.length>16?' split':'');
  el('log').innerHTML = list.map(function(h){
    var on = doneOn(h,S.date);
    var ad = adherence30(h.id);
    /* HT-16 R70.98 · ROW ANATOMY, and it is fixed:
         [checkbox 44x44] [name - an <a> when the task has a URL] [flex spacer] [edit 44x44]
       No absolutely-positioned overlays; each control owns its hit target; tapping the name never
       opens the editor and the editor never follows the link. Tab order is DOM order:
       checkbox -> link -> edit. The row is a <div> now, not a <button>: a <button> cannot legally
       contain the <a>, and nesting them is how a link and an edit come to share one hit box. */
    var nmIn = esc(label(h.name)) +
      ((S.hasCue && h.cue)?'<i class="cue">'+esc(h.cue)+'</i>':'');
    var LK = '<span class="lk"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7L11.5 5"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19"/></svg></span>';
    var nm = h.link
      ? '<a class="nm lnk" href="'+esc(h.link)+'" target="_blank" rel="noopener">'+nmIn+LK+'</a>'
      : '<span class="nm">'+nmIn+'</span>';
    return '<div class="li'+(on?' on':'')+(h.id===nx?' nx':'')+'" data-h="'+h.id+'">'+
      '<button class="bxw" type="button" data-tog="'+h.id+'" aria-pressed="'+(on?'true':'false')+
        '" title="'+esc(label(h.name))+'"><span class="bx"></span></button>'+
      nm+
      /* HT-16 S7 · R70.104 — THE RED FLAG RENDERER IS DELETED. It printed a red flag glyph and a
         number to the right of a name whenever missRun(habit) >= 3, meaning "you have missed this
         standard N days running". Display-only: computed live from days.checked, carrying no data
         of its own, so under R70.104 and R70.79 the renderer goes and nothing in the database
         changes -- the misses are still in `days` and every other view still counts them.
         Root cause worth recording: HT-9a's allow-list hid five row spans (.gp .mn .ad .cue .back)
         and missed this one, which is why an unexplained red marker survived into the simple view
         for four wires. After this the only red on a task row is S6's overdue tint. */
      (returnedOn(h,S.date)?'<span class="back" title="back after a miss — the return is the win">↩</span>':'')+
      (h.cadence==='weekly'?'<span class="wk">WEEKLY</span>':'')+
      '<span class="sp16"></span>'+
      '<span class="mn">'+(h.minutes?h.minutes+'m':'—')+'</span>'+
      '<span class="ad" style="color:'+gtxt(ad)+'">'+(ad==null?'—':ad+'%')+'</span>'+
      '</div>';
  }).join('') || '<div class="empty">Nothing matches.</div>';

  var ids=daily().map(function(x){return x.id;});
  var done=ids.filter(function(i){return ck[i];}).length;
  el('logC').textContent = done+' / '+ids.length+' · '+fmt(earned(S.date))+' earned';
}

/* ---- input 2 and 3: the rating strip and the journal ---- */
function paintRating(){
  var cur = S.priv && S.priv.rating!=null ? +S.priv.rating : null, h='';
  for(var i=1;i<=10;i++) h+='<button data-r="'+i+'" class="'+(cur===i?'on':'')+'">'+i+'</button>';
  h+='<button data-r="0" class="clr" title="clear">×</button>';
  el('rate').innerHTML=h;
  var r7=rollRate(7), r30=rollRate(30);
  el('rateC').textContent = (cur==null?'not rated':'rated '+cur)+
    (r7==null?'':' · 7d '+r7)+(r30==null?'':' · 30d '+r30);
}
function paintJournalInputs(){
  el('iWhy').value    = (S.priv&&S.priv.why)||'';
  el('iTasks').value  = (S.priv&&S.priv.tasks)||'';
  el('iPrayer').value = (S.priv&&S.priv.prayer)||'';
  var n=0; ['why','tasks','prayer'].forEach(function(k){ if(S.priv&&S.priv[k]) n++; });
  el('jrnC').textContent = n? n+' of 3 written · autosaves' : 'saves as you type';
}

function toggle(hid){
  var h=S.habits.filter(function(x){return x.id===hid;})[0]; if(!h) return;
  var r=S.byDate[S.date] || (S.byDate[S.date]={date:S.date,checked:{},pct:0});
  r.checked = r.checked || {};
  if(h.cadence==='weekly'){
    /* a weekly is credited on the day it is actually done */
    if(r.checked[hid]) delete r.checked[hid];
    else if(weekDone(hid,S.date)){ toast('already done this week'); return; }
    else r.checked[hid]=true;
  } else {
    if(r.checked[hid]) delete r.checked[hid]; else r.checked[hid]=true;
  }
  queueSave(); paintMast(); paintLog(); paintRail(); paintRight();
}

/* ============================ instruments ============================ */
function fitSvg(id,h){
  var n=el(id), w=Math.max(240,Math.round(n.clientWidth||n.parentNode.clientWidth||340));
  n.setAttribute('viewBox','0 0 '+w+' '+h);
  n.setAttribute('preserveAspectRatio','xMinYMin meet');
  n.setAttribute('height',h); n.style.height=h+'px';
  return w;
}
/* fills use the density ramp; text uses ink / bad / good only */
function gtxt(p){ return p==null?'var(--ink3)':(p<50?'var(--bad)':(p>=90?'var(--good)':'var(--ink)')); }
function paintRight(){
  paintSankey(); paintHeat(); paintCal(); paintChart(); paintMomo(); paintDow();
  paintByMo(); paintByYear(); paintGdist();
  paintRChart(); paintRScat(); paintRByMo(); paintJournal();
  paintPerHabit(); paintScatter(); paintStreaks(); paintGroups(); paintNextMove();
  paintTLedger(); paintLife();
}

/* ---- month calendar, completion or rating ---- */
function paintCal(){
  var y=S.calYM[0], m=S.calYM[1];
  var first=new Date(y,m,1), start=new Date(first);
  start.setDate(1-((first.getDay()+6)%7));                 /* Monday-led */
  var h=['Mo','Tu','We','Th','Fr','Sa','Su'].map(function(d){return '<div class="hd">'+d+'</div>';}).join('');
  for(var i=0;i<42;i++){
    var d=new Date(start); d.setDate(start.getDate()+i);
    var k=dk(d), out=(d.getMonth()!==m), fut=(k>today());
    var v,f,txt;
    if(S.calMode==='rate'){ v=ratingOf(k); f=(v==null?'var(--sunk)':dens(v*10)); txt=(v==null?'':v); }
    else { var r=S.byDate[k]; v=(r&&r.pct!=null&&!fut)?r.pct:null; f=dens(v); txt=(v==null?'':v); }
    h+='<button class="d'+(out?' out':'')+(k===today()?' tdy':'')+'" data-cd="'+k+'" style="background:'+f+'">'+
       '<b>'+d.getDate()+'</b>'+(txt===''?'':'<s>'+txt+'</s>')+'</button>';
  }
  el('cal').innerHTML=h;
  el('calNav').innerHTML='<button class="mv" data-cm="-1">‹</button> '+MO[m]+' '+y+' <button class="mv" data-cm="1">›</button>';
}
function paintHeatLegend(){
  var h='<span>less</span>';
  [0,20,40,60,80,100].forEach(function(p){ h+='<i style="background:'+dens(p)+'"></i>'; });
  h+='<span>more</span><span style="margin-left:auto">grey = no entry</span>';
  el('heatLeg').innerHTML=h;
}

/* ---- rating: the second input finally gets its outputs ---- */
function paintRChart(){
  var N=90, H=118, W=fitSvg('rChart',H), pts=[], any=false;
  for(var i=N-1;i>=0;i--){ var v=ratingOf(shift(today(),-i)); pts.push(v); if(v!=null) any=true; }
  if(!any){ el('rChart').innerHTML='<text x="6" y="20">No ratings yet — rate a day on the left.</text>';
    el('rTrendC').textContent='90 days'; return; }
  var px=function(i){ return 24+i*(W-32)/(N-1); }, py=function(v){ return H-16-(v/10)*(H-28); };
  var s='';
  [0,5,10].forEach(function(v){
    s+='<line class="ax" x1="22" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
       '<text x="18" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  pts.forEach(function(v,i){ if(v==null) return;
    s+='<rect x="'+(px(i)-2).toFixed(1)+'" y="'+py(v).toFixed(1)+'" width="4" height="'+(py(0)-py(v)).toFixed(1)+
       '" fill="'+dens(v*10)+'"><title>'+shift(today(),-(N-1-i))+' · '+v+'/10</title></rect>'; });
  var m30=rollRate(30);
  if(m30!=null) s+='<line x1="22" y1="'+py(m30)+'" x2="'+(W-4)+'" y2="'+py(m30)+
    '" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="3 3"/>';
  el('rChart').innerHTML=s;
  el('rTrendC').textContent='90 days · 30d avg '+(m30==null?'—':m30);
}
function pearson(a,b){
  var n=a.length; if(n<3) return null;
  var ma=a.reduce(function(x,y){return x+y;},0)/n, mb=b.reduce(function(x,y){return x+y;},0)/n;
  var sn=0,da=0,db=0;
  for(var i=0;i<n;i++){ var x=a[i]-ma, y=b[i]-mb; sn+=x*y; da+=x*x; db+=y*y; }
  if(!da||!db) return null;
  return sn/Math.sqrt(da*db);
}
function paintRScat(){
  var H=136, W=fitSvg('rScat',H), P=[], R=[];
  dates().forEach(function(k){
    var r=S.byDate[k], v=ratingOf(k);
    if(r&&r.pct!=null&&v!=null){ P.push(r.pct); R.push(v); }
  });
  if(P.length<3){
    el('rScat').innerHTML='<text x="6" y="20">Rate a few more days and this fills in.</text>';
    el('rScatN').innerHTML='Once there are ratings on at least three logged days, this answers one question: <b>does hitting the standard actually make the day feel better?</b>';
    return;
  }
  var px=function(p){ return 30+(p/100)*(W-44); }, py=function(v){ return H-20-(v/10)*(H-36); };
  var s='';
  [0,5,10].forEach(function(v){ s+='<line class="ax" x1="26" y1="'+py(v)+'" x2="'+(W-6)+'" y2="'+py(v)+'"/>'+
    '<text x="22" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  for(var i=0;i<P.length;i++)
    s+='<circle cx="'+px(P[i]).toFixed(1)+'" cy="'+py(R[i]).toFixed(1)+'" r="4" fill="'+dens(P[i])+
       '" opacity=".8"><title>'+P[i]+'% · rated '+R[i]+'</title></circle>';
  var r=pearson(P,R);
  if(r!=null){
    var ma=P.reduce(function(x,y){return x+y;},0)/P.length, mb=R.reduce(function(x,y){return x+y;},0)/R.length;
    var num=0,den=0; for(var j=0;j<P.length;j++){ num+=(P[j]-ma)*(R[j]-mb); den+=(P[j]-ma)*(P[j]-ma); }
    if(den){ var sl=num/den, ic=mb-sl*ma;
      s+='<line x1="'+px(0)+'" y1="'+py(clamp(ic,0,10))+'" x2="'+px(100)+'" y2="'+py(clamp(sl*100+ic,0,10))+
         '" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>'; }
  }
  s+='<text x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">completion % →</text>';
  el('rScat').innerHTML=s;
  var strength = r==null?'':(Math.abs(r)>=0.6?'strong':Math.abs(r)>=0.35?'real but moderate':'weak');
  el('rScatN').innerHTML = r==null ? '' :
    'Across <b>'+P.length+'</b> rated days the correlation is <b>r = '+r.toFixed(2)+'</b> — '+strength+
    (r>=0.35 ? '. Hitting the standard does make the day feel better; the routine is earning its cost.'
     : r<=-0.35 ? '. Higher completion goes with <b>worse</b> days. The list is buying compliance at the price of the day — worth looking at what you are grinding through.'
     : '. Completion and how the day felt are close to independent. Either the list is not touching what actually makes a day good, or something outside it is driving the mood.');
}
function monthly(fn){
  var sum=new Array(12).fill(0), n=new Array(12).fill(0);
  dates().forEach(function(k){ var v=fn(k); if(v==null) return;
    var m=dnum(k).getMonth(); sum[m]+=v; n[m]++; });
  return sum.map(function(x,i){ return n[i]?Math.round(x/n[i]*10)/10:null; });
}
function colChart(id,vals,labels,maxv,fmtv,colf){
  var mx=maxv||Math.max.apply(null,vals.map(function(x){return x||0;}))||1;
  el(id).innerHTML = vals.map(function(v,i){
    var h=v==null?1:Math.max(3,Math.round(v/mx*52));
    return '<div class="c"><b'+(v==null?' style="color:var(--ink3)"':'')+'>'+(v==null?'·':(fmtv?fmtv(v):v))+'</b>'+
      '<i style="height:'+h+'px;background:'+(v==null?'var(--sunk)':colf(v))+(v==null?';opacity:.5':'')+'"></i>'+
      '<u>'+labels[i]+'</u></div>';
  }).join('');
}
function paintByMo(){
  var v=monthly(function(k){ var r=S.byDate[k]; return (r&&r.pct!=null)?r.pct:null; });
  colChart('byMo', v.map(function(x){return x==null?null:Math.round(x);}),
    MO.map(function(m){return m[0];}), 100, null, dens);
  var got=v.filter(function(x){return x!=null;}).length;
  el('byMoC').textContent='completion · '+got+' of 12 months';
}
function paintRByMo(){
  var v=monthly(ratingOf);
  colChart('rByMo', v, MO.map(function(m){return m[0];}), 10,
    function(x){ return x.toFixed(1); }, function(x){ return dens(x*10); });
}
function paintByYear(){
  var y={}, o=[];
  dates().forEach(function(k){ var r=S.byDate[k]; if(!r||r.pct==null) return;
    var yy=k.slice(0,4); if(!y[yy]){ y[yy]={s:0,n:0,rs:0,rn:0}; o.push(yy); }
    y[yy].s+=r.pct; y[yy].n++;
    var v=ratingOf(k); if(v!=null){ y[yy].rs+=v; y[yy].rn++; }
  });
  if(!o.length){ el('byYear').innerHTML='<div class="empty">Nothing logged yet.</div>'; return; }
  el('byYear').innerHTML='<table class="kv">'+o.sort().reverse().map(function(yy){
    var a=y[yy], p=Math.round(a.s/a.n), r=a.rn?Math.round(a.rs/a.rn*10)/10:null;
    return '<tr><td class="k">'+yy+' <span style="color:var(--ink3)">'+a.n+' days</span></td>'+
      '<td class="v w" style="white-space:nowrap"><b style="color:'+gtxt(p)+'">'+p+'%</b>'+
      '<span style="color:var(--ink3)"> · '+(r==null?'—':r+'/10')+'</span></td></tr>';
  }).join('')+'</table>';
}
function paintJournal(){
  var ks=Object.keys(S.privAll).filter(function(k){
    var p=S.privAll[k]; return p && (p.why||p.tasks||p.prayer);
  }).sort().reverse().slice(0,14);
  if(!ks.length){ el('jArc').innerHTML='<div class="empty">Nothing written yet. The journal on the left lands here.</div>';
    el('jArcC').textContent=''; return; }
  el('jArc').innerHTML = ks.map(function(k){
    var p=S.privAll[k], r=S.byDate[k], d=dnum(k);
    var body='';
    if(p.why)    body+='<p class="q">'+esc(p.why)+'</p>';
    if(p.tasks)  body+='<p>'+esc(p.tasks)+'</p>';
    if(p.prayer) body+='<p class="q">'+esc(p.prayer)+'</p>';
    return '<button class="jr" data-jd="'+k+'" style="display:block;width:100%">'+
      '<span class="h"><b>'+WD[d.getDay()]+' '+MO[d.getMonth()]+' '+d.getDate()+'</b>'+
      (p.rating!=null?'<s style="color:'+gtxt(p.rating*10)+'">'+p.rating+'/10</s>':'')+
      '<span>'+(r&&r.pct!=null?r.pct+'%':'')+'</span></span>'+body+'</button>';
  }).join('');
  el('jArcC').textContent = ks.length+' entr'+(ks.length===1?'y':'ies');
}
function paintNextMove(){
  var a=nextMoveRank();
  if(!a.length){ el('nextMove').innerHTML='<div class="empty">Log a few days first.</div>'; return; }
  var b=a[0], n=daily().length;
  var gain=Math.round(100/n);
  var tight = b.pct>=70;
  el('nextMove').innerHTML='<div class="nm"><span class="big">'+esc(label(b.h.name))+'</span>'+
    'Held <b>'+b.pct+'%</b> over the last '+b.of+' logged days at a cost of '+
    (b.mins?('<b>'+b.mins+' minutes</b>'):'<b>no time at all</b>')+
    '. It is the cheapest ground left on the board — about <b>'+gain+
    ' points</b> of score per day, for '+(b.mins?b.mins+' minutes':'nothing')+'.'+
    (tight?' Nothing cheap is badly broken right now, so the next real gain has to come from something that costs time.':'')+
    '<div style="padding-top:8px;color:var(--ink2)">Runners-up: '+
      a.slice(1,4).map(function(s){ return esc(label(s.h.name))+' ('+s.pct+'%)'; }).join(' · ')+
    '</div></div>';
}



/* ---- where the day goes: a true two-stage flow ---- */
function paintSankey(){
  var H=156, W=fitSvg('sank',H), X=2, T1=34, BH=30, T2=110, ck=ckOf(S.date);
  var day=1440, com=committed();
  if(!com){ el('sank').innerHTML='<text x="2" y="20">No minutes priced yet — set them in Settings.</text>'; return; }

  var gs={}, order=[];
  daily().forEach(function(h){
    var g=h.group_name||'Other'; if(!gs[g]){ gs[g]={m:0,d:0}; order.push(g); }
    gs[g].m+=(h.minutes||0); if(ck[h.id]) gs[g].d+=(h.minutes||0);
  });
  order=order.filter(function(g){ return gs[g].m>0; });

  var px=(W-X*2)/com, s='', x=X, seg=[];
  order.forEach(function(g,i){
    var w=gs[g].m*px;
    seg.push({g:g,x:x,w:w,m:gs[g].m,d:gs[g].d});
    s+='<rect x="'+x.toFixed(1)+'" y="'+T1+'" width="'+Math.max(w-1,.6).toFixed(1)+'" height="'+BH+
       '" fill="var(--accent)" opacity="'+(0.92-0.17*i).toFixed(2)+'"/>';
    if(w>78)      s+='<text x="'+(x+1)+'" y="'+(T1-7)+'" class="b">'+esc(g)+' · '+fmt(gs[g].m)+'</text>';
    else if(w>34) s+='<text x="'+(x+1)+'" y="'+(T1-7)+'" class="b">'+esc(g.slice(0,4))+'</text>';
    x+=w;
  });

  var done=order.reduce(function(t,g){return t+gs[g].d;},0), miss=com-done;
  var dW=done*px, mW=miss*px;
  s+='<rect x="'+X+'" y="'+T2+'" width="'+Math.max(dW-1,.6).toFixed(1)+'" height="'+BH+'" fill="var(--accent)"/>';
  s+='<rect x="'+(X+dW).toFixed(1)+'" y="'+T2+'" width="'+Math.max(mW,.6).toFixed(1)+'" height="'+BH+
     '" fill="var(--sunk)" stroke="var(--rule2)" stroke-dasharray="2 2"/>';

  var dx=X, mx=X+dW;
  seg.forEach(function(p){
    if(p.d>0){ var w=p.d*px; s+=rib(p.x,w,dx,w,T1+BH,T2,'var(--accent)',0.22); dx+=w; }
    var mm=p.m-p.d;
    if(mm>0){ var w2=mm*px; s+=rib(p.x+p.d*px,w2,mx,w2,T1+BH,T2,'var(--ink3)',0.09); mx+=w2; }
  });

  s+='<text x="'+X+'" y="12" class="b">'+fmt(com)+' committed</text>'+
     '<text x="'+(W-X)+'" y="12" text-anchor="end">'+Math.round(com/day*100)+'% of 24h · '+fmt(day-com)+' unclaimed</text>';
  s+='<text x="'+X+'" y="'+(T2+BH+15)+'" class="b" fill="var(--accent)">Done '+fmt(done)+'</text>'+
     '<text x="'+(W-X)+'" y="'+(T2+BH+15)+'" text-anchor="end">Missed '+fmt(miss)+'</text>';
  el('sank').innerHTML=s;
}
function rib(x1,w1,x2,w2,y1,y2,fill,op){
  var m=(y1+y2)/2;
  return '<path d="M'+x1+','+y1+' C'+x1+','+m+' '+x2+','+m+' '+x2+','+y2+
    ' L'+(x2+w2)+','+y2+' C'+(x2+w2)+','+m+' '+(x1+w1)+','+m+' '+(x1+w1)+','+y1+' Z" fill="'+fill+
    '" opacity="'+op+'" stroke="var(--rule)" stroke-width=".5"/>';
}

/* ---- record: 52-week heat ---- */
function paintHeat(){
  var end=dnum(today()), all=dates();
  var start=new Date(end); start.setDate(end.getDate()-363);
  if(all.length){ var f=dnum(all[0]); f.setDate(f.getDate()-7); if(f>start) start=f; }
  start.setDate(start.getDate()-((start.getDay()+6)%7));       /* back to a Monday */

  var cells='', cols=[], d=new Date(start);
  while(d<=end){
    cols.push(new Date(d));                                     /* the Monday of this column */
    for(var wd=0;wd<7;wd++){
      if(d>end){ cells+='<i style="background:transparent"></i>'; d.setDate(d.getDate()+1); continue; }
      var k=dk(d), r=S.byDate[k], p=(r&&r.pct!=null)?r.pct:null;
      cells+='<i class="'+(k===today()?'tdy':'')+'" style="background:'+dens(p)+
             '" title="'+k+(p==null?'':' · '+p+'%')+'"></i>';
      d.setDate(d.getDate()+1);
    }
  }
  el('heat').innerHTML=cells;

  /* month strip: one span per month, exact column pitch, so it stays aligned */
  var PITCH=11, mh='', run=0, cur=cols.length?cols[0].getMonth():0;
  for(var i=0;i<=cols.length;i++){
    var m=(i<cols.length)?cols[i].getMonth():-1;
    if(m!==cur){
      var w=run*PITCH;
      mh+='<span style="width:'+w+'px">'+(w>=28?MO[cur]:'')+'</span>';
      cur=m; run=0;
    }
    run++;
  }
  el('mrow').innerHTML=mh;
  el('heatC').textContent=all.length+' days logged · '+(rolling(365)||0)+'% mean';
  paintHeatLegend();
}

/* ---- trend ---- */
function paintChart(){
  var N=90, H=118, W=fitSvg('chart',H), pts=[], i, any=false;
  for(i=N-1;i>=0;i--){
    var k=shift(today(),-i), r=S.byDate[k];
    pts.push(r&&r.pct!=null?r.pct:null); if(r&&r.pct!=null) any=true;
  }
  if(!any){ el('chart').innerHTML='<text x="6" y="20">Not enough logged days yet.</text>'; return; }
  var px=function(i){ return 24+i*(W-32)/(N-1); }, py=function(v){ return H-16-(v/100)*(H-28); };
  var s='';
  [0,50,100].forEach(function(v){
    s+='<line class="ax" x1="22" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
       '<text x="18" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>';
  });
  var d='',a='',open=false, first=null,lastX=null;
  pts.forEach(function(v,i){
    if(v==null){ open=false; return; }
    var X=px(i),Y=py(v);
    d += (open?' L':' M')+X.toFixed(1)+','+Y.toFixed(1);
    if(first==null) first=X; lastX=X; open=true;
  });
  if(first!=null){
    a='M'+first+','+py(0)+' ';
    pts.forEach(function(v,i){ if(v!=null) a+='L'+px(i).toFixed(1)+','+py(v).toFixed(1)+' '; });
    a+='L'+lastX+','+py(0)+' Z';
    s+='<path class="ar" d="'+a+'"/>';
  }
  s+='<path class="ln" d="'+d+'"/>';
  var m30=rolling(30); if(m30!=null)
    s+='<line x1="22" y1="'+py(m30)+'" x2="'+(W-4)+'" y2="'+py(m30)+'" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="3 3"/>';
  el('chart').innerHTML=s;
  el('trendC').textContent='90 days · 30d mean '+(m30==null?'—':m30+'%');
}

/* ---- momentum ---- */
function paintMomo(){
  var a=rolling(7), b=rolling(7, shift(today(),-7));
  var d=(a==null||b==null)?null:a-b;
  var proj=null;
  if(a!=null&&d!=null) proj=clamp(a+d,0,100);
  el('momo').innerHTML='<table class="kv">'+
    kv('This 7 days', a==null?'—':a+'%') +
    kv('Prior 7 days', b==null?'—':b+'%') +
    kv('Change', d==null?'—':'<span style="color:'+(d>=0?'var(--good)':'var(--bad)')+'">'+(d>0?'+':'')+d+' pts</span>') +
    kv('If it holds', proj==null?'—':proj+'% next week') +
    '</table>';
}
function kv(k,v){ return '<tr><td class="k">'+k+'</td><td class="v">'+v+'</td></tr>'; }

/* ---- day of week ---- */
function paintDow(){
  var sum=[0,0,0,0,0,0,0], n=[0,0,0,0,0,0,0];
  S.days.forEach(function(r){ if(r.pct==null||r.date>today()) return;
    var w=dnum(r.date).getDay(); sum[w]+=r.pct; n[w]++; });
  var v=sum.map(function(s,i){ return n[i]?Math.round(s/n[i]):null; });
  var mx=Math.max.apply(null,v.map(function(x){return x||0;}))||100;
  var idx=[1,2,3,4,5,6,0];
  el('dow').innerHTML = idx.map(function(i){
    var p=v[i], h=p==null?0:Math.max(2,Math.round(p/mx*52));
    return '<div class="c"><b style="color:'+gtxt(p)+'">'+(p==null?'—':p)+'</b><i style="height:'+h+'px;background:'+dens(p)+'"></i><u>'+WD2[i]+'</u></div>';
  }).join('');
}

/* ---- grade distribution ---- */
function paintGdist(){
  var b=[0,0,0,0,0,0];
  S.days.forEach(function(r){ if(r.pct==null||r.date>today()) return; b[grade(r.pct)[1]]++; });
  var mx=Math.max.apply(null,b)||1, tot=b.reduce(function(x,y){return x+y;},0);
  var names=['F','D','C','B','A','A+'];
  el('gdist').innerHTML = names.map(function(nm,i){
    var h=Math.max(b[i]?3:1,Math.round(b[i]/mx*52));
    return '<div class="c"><b>'+(b[i]||'')+'</b><i style="height:'+h+'px;background:var(--g'+i+')'+(b[i]?'':';opacity:.25')+'"></i><u>'+nm+'</u></div>';
  }).join('');
  el('gdC').textContent = tot+' days';
}

/* ---- every standard, weakest first ---- */
function stats(){
  return S.habits.map(function(h){
    var n=0,t=0,cur=0,best=0,run=0,seen=false;
    for(var i=89;i>=0;i--){
      var k=shift(today(),-i); if(!S.byDate[k]) continue;
      if(i<30){ t++; if(doneOn(h,k)) n++; }
      seen=true;
      if(doneOn(h,k)){ run++; if(run>best) best=run; } else if(k!==today()) run=0;
    }
    cur=run;
    return { h:h, pct:t?Math.round(n/t*100):null, hits:n, of:t, cur:cur, best:best,
             mins:(h.minutes||0), cost:(h.minutes||0)*(t?n:0) };
  });
}
function paintPerHabit(){
  var a=stats().sort(function(x,y){ return (x.pct==null?101:x.pct)-(y.pct==null?101:y.pct); });
  el('perHabit').innerHTML='<div class="bars">'+a.map(function(s){
    var p=s.pct==null?0:s.pct;
    return '<div class="br"><span class="n">'+esc(label(s.h.name))+'</span>'+
      '<span class="t"><i style="width:'+p+'%;background:'+dens(s.pct)+'"></i></span>'+
      '<span class="p" style="color:'+gtxt(s.pct)+'">'+(s.pct==null?'—':p+'%')+'</span></div>';
  }).join('')+'</div>';
  var weak=a.filter(function(s){return s.pct!=null&&s.pct<50;}).length;
  el('phC').textContent = weak+' under 50% · weakest first';
}

/* ---- cost against adherence ---- */
function paintScatter(){
  var H=136,W=fitSvg('scat',H),a=stats().filter(function(s){ return s.mins>0 && s.pct!=null; });
  if(a.length<3){ el('scat').innerHTML='<text x="6" y="20">Price the standards to see this.</text>'; el('scatN').textContent=''; return; }
  var mx=Math.max.apply(null,a.map(function(s){return s.mins;}));
  var px=function(m){ return 30+(m/mx)*(W-44); }, py=function(p){ return H-20-(p/100)*(H-36); };
  var s='';
  [0,50,100].forEach(function(v){ s+='<line class="ax" x1="26" y1="'+py(v)+'" x2="'+(W-6)+'" y2="'+py(v)+'"/>'+
    '<text x="22" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
  a.forEach(function(p){
    s+='<circle cx="'+px(p.mins).toFixed(1)+'" cy="'+py(p.pct).toFixed(1)+'" r="'+
      (3+Math.min(4,p.mins/30)).toFixed(1)+'" fill="'+gcol(p.pct)+'" opacity=".78"><title>'+
      esc(label(p.h.name))+' · '+p.mins+'m · '+p.pct+'%</title></circle>';
  });
  s+='<text x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">minutes per day →</text>';
  el('scat').innerHTML=s;

  var heavy=a.filter(function(x){return x.mins>=30;}), light=a.filter(function(x){return x.mins<30;});
  var m=function(z){ return z.length?Math.round(z.reduce(function(t,x){return t+x.pct;},0)/z.length):null; };
  var hm=m(heavy), lm=m(light);
  el('scatN').innerHTML = (hm!=null&&lm!=null)
    ? 'Under 30 minutes you hold <b>'+lm+'%</b>. At 30 and over you hold <b>'+hm+'%</b>. '+
      (lm-hm>=8 ? 'The gap is <b>'+(lm-hm)+' points</b> — the failures are priced, not moral.' :
       'The gap is small; time is not what is stopping you.')
    : '';
}

/* ---- streaks ---- */
function paintStreaks(){
  var a=stats().sort(function(x,y){ return y.cur-x.cur || y.best-x.best; }).slice(0,12);
  el('streaks').innerHTML='<table class="kv">'+a.map(function(s){
    return '<tr><td class="k trunc">'+esc(label(s.h.name))+'</td><td class="v w" style="white-space:nowrap">'+
      '<b style="color:'+(s.cur>0?'var(--accent)':'var(--ink3)')+'">'+s.cur+'</b>'+
      '<span style="color:var(--ink3)"> · '+s.best+'</span></td></tr>';
  }).join('')+'</table>';
}

/* ---- by group ---- */
function paintGroups(){
  var g={},o=[];
  S.habits.forEach(function(h){ var k=h.group_name||'Other'; if(!g[k]){g[k]={n:0,t:0,m:0};o.push(k);} });
  for(var i=0;i<30;i++){
    var k=shift(today(),-i); if(!S.byDate[k]) continue;
    S.habits.forEach(function(h){ var kk=h.group_name||'Other';
      g[kk].t++; if(doneOn(h,k)) g[kk].n++; });
  }
  S.habits.forEach(function(h){ g[h.group_name||'Other'].m += (h.minutes||0); });
  el('groups').innerHTML='<div class="bars">'+o.map(function(k){
    var p=g[k].t?Math.round(g[k].n/g[k].t*100):0;
    return '<div class="br"><span class="n">'+esc(k)+' <span style="color:var(--ink3)">'+fmt(g[k].m)+'</span></span>'+
      '<span class="t"><i style="width:'+p+'%;background:'+dens(p)+'"></i></span>'+
      '<span class="p" style="color:'+gtxt(p)+'">'+p+'%</span></div>';
  }).join('')+'</div>';
}

/* ---- time ledger ---- */
function paintTLedger(){
  var com=committed(), spent=0, days=0;
  for(var i=0;i<30;i++){
    var k=shift(today(),-i), r=S.byDate[k]; if(!r) continue;
    days++;
    daily().forEach(function(h){ if(doneOn(h,k)) spent+=(h.minutes||0); });
  }
  var owed=com*days, lost=owed-spent;
  el('tledger').innerHTML='<table class="kv">'+
    kv('Committed per day', fmt(com)+' · '+Math.round(com/1440*100)+'% of 24h') +
    kv('Owed over '+days+' days', fmt(owed)) +
    kv('Actually spent', fmt(spent)) +
    kv('Unspent', '<span style="color:var(--bad)">'+fmt(lost)+'</span>') +
    kv('Per day unspent', fmt(days?lost/days:0)) +
    kv('Free hours left in a day', fmt(1440-com-480)+' <span style="color:var(--ink3)">after 8h sleep</span>') +
    '</table>';
}

/* ---- life ---- */
function paintLife(){
  var b=S.priv0&&S.priv0.birth_date;
  if(!b){ el('life').innerHTML=''; el('lifeC').textContent='add a birthday in settings'; return; }
  var born=new Date(b+'T12:00:00'), now=new Date();
  var lived=Math.floor((now-born)/6048e5), total=90*52;
  var h='';
  for(var i=0;i<total;i++) h+='<i class="'+(i<lived?'p':(i===lived?'n':''))+'"></i>';
  el('life').innerHTML=h;
  el('lifeC').textContent = lived.toLocaleString()+' of '+total.toLocaleString()+' weeks · '+
    Math.round(lived/total*100)+'% spent';
}

/* ---- circle ---- */
async function paintCircle(){
  var box=el('circle');
  try{
    var mine=await sb.from('circle_members').select('circle_id').eq('user_id',S.me.id);
    var ids=(mine.data||[]).map(function(r){return r.circle_id;});
    if(!ids.length){ box.innerHTML='<div class="empty">No circle yet. <b>Manage</b> to create or join one.</div>'; return; }
    var cs=await sb.from('circles').select('id,name,join_code').in('id',ids);
    var mem=await sb.from('circle_members').select('circle_id,user_id').in('circle_id',ids);
    var uids=(mem.data||[]).map(function(r){return r.user_id;});
    var pr=await sb.from('profiles').select('id,display_name,handle').in('id',uids);
    var pm={}; (pr.data||[]).forEach(function(p){ pm[p.id]=p; });
    var od=await sb.from('days').select('user_id,date,pct').in('user_id',uids).gte('date',shift(today(),-13));
    var by={}; (od.data||[]).forEach(function(r){ (by[r.user_id]=by[r.user_id]||{})[r.date]=r.pct; });
    S.circle=(cs.data||[])[0]||null;

    var h='';
    (cs.data||[]).forEach(function(c){
      var ms=(mem.data||[]).filter(function(m){return m.circle_id===c.id;});
      var rank=ms.map(function(m){
        var d=by[m.user_id]||{}, a=[];
        for(var i=6;i>=0;i--){ var v=d[shift(today(),-i)]; if(v!=null) a.push(v); }
        return { u:m.user_id, avg:a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):null, d:d };
      }).sort(function(x,y){ return (y.avg||-1)-(x.avg||-1); });
      h+='<div class="sh" style="padding-top:0"><h2>'+esc(c.name)+'</h2><span class="ln"></span><span class="c">code '+esc(c.join_code||'')+'</span></div>';
      h+=rank.map(function(r,i){
        var p=pm[r.u]||{}, nm=p.display_name||p.handle||'member';
        return '<div class="mem"><span class="rk num">'+(i+1)+'</span>'+
          '<span class="nm">'+esc(nm)+(r.u===S.me.id?' <span style="color:var(--ink3)">· you</span>':'')+'</span>'+
          '<span class="spk">'+spark(r.d)+'</span>'+
          '<span class="pc" style="color:'+gtxt(r.avg)+'">'+(r.avg==null?'—':r.avg+'%')+'</span></div>';
      }).join('');
    });
    box.innerHTML=h;
  }catch(e){ box.innerHTML='<div class="empty">Circle unavailable.</div>'; }
}
function spark(d){
  var w=64,h=16,s='',n=14;
  for(var i=0;i<n;i++){
    var v=d[shift(today(),-(n-1-i))];
    var bh=v==null?1:Math.max(1,Math.round(v/100*h));
    s+='<rect x="'+(i*(w/n)).toFixed(1)+'" y="'+(h-bh)+'" width="'+(w/n-1).toFixed(1)+'" height="'+bh+
       '" fill="'+dens(v)+'"/>';
  }
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+s+'</svg>';
}

/* ============================ overlay ============================ */
function openOv(title,body,onOpen){
  el('ovBody').innerHTML='<div class="ovh"><h3>'+esc(title)+'</h3><span class="sp" style="flex:1"></span>'+
    '<button class="tbtn" data-x="1">Close</button></div>'+body;
  el('ov').classList.add('on'); el('ov').scrollTop=0;
  if(onOpen) onOpen();
}
function closeOv(){ el('ov').classList.remove('on'); }

/* ---- settings: everything editable lives here ---- */
function openSettings(){
  var GROUPS=['Morning','Afternoon','Night','Standards','Weekly','Other'];
  var rows=S.habits.slice().sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0);});
  S.edSrc=rows;
  /* R46.5: cue coverage extends to EVERY below-median standard, not the worst ten. */
  var WEAK10=belowMedian();
  function edRow(h,i){
    return '<div class="ed" data-i="'+i+'">'+
      '<button class="hnd" data-up="'+i+'" title="move up">↑</button>'+
      '<input class="en" value="'+esc(h.name)+'" placeholder="standard">'+
      '<input class="em num" type="number" min="0" step="5" value="'+(h.minutes||0)+'" title="minutes">'+
      (S.hasCue?('<input class="eq" value="'+esc(h.cue||'')+'" placeholder="'+
        (WEAK10[h.id]?'⚑ after I ___, I will ___':'after I ___, I will ___')+
        '" title="Cue — the event this standard hangs off. Ten weakest are flagged.">'):'')+
      '<select class="eg">'+GROUPS.map(function(g){
        return '<option'+(g===(h.group_name||'Other')?' selected':'')+'>'+g+'</option>'; }).join('')+'</select>'+
      '<select class="ec"><option value="daily"'+(h.cadence!=='weekly'?' selected':'')+'>Daily</option>'+
        '<option value="weekly"'+(h.cadence==='weekly'?' selected':'')+'>Weekly</option></select>'+
      '<button class="x" data-rm="'+i+'" title="archive">×</button></div>';
  }
  var body=
    '<div class="sh"><h2>The standards</h2><span class="ln"></span><span class="c">'+rows.length+' · edit anything</span></div>'+
    (S.hasCue?(function(){ var c=cueCoverage(); return '<div class="cuecov">Cues written: <b>'+c.got+
      '</b> of <b>'+c.need+'</b> below-median standards'+(c.got<c.need?' — the flagged rows are where a cue is worth writing.':' — covered.')+
      '</div>'; })():'')+
    '<div class="bud" id="bud"></div>'+
    '<div class="tools" style="padding:0 0 8px">'+
      '<button class="btn" id="edAdd">+ Add</button>'+
      '<button class="btn" id="edStrip" title="Remove the 5:00 - 5:20 style prefixes">Strip clock times</button>'+
      '<span style="flex:1"></span>'+
      '<button class="btn pri" id="edSave">Save standards</button>'+
    '</div>'+
    '<div id="edList">'+rows.map(edRow).join('')+'</div>'+
    '<div class="tools" style="padding-top:10px">'+
      '<button class="btn" id="edAdd2">+ Add</button>'+
      '<span style="flex:1"></span>'+
      '<button class="btn pri" id="edSave2">Save standards</button>'+
    '</div>'+

    '<div class="sh"><h2>Look</h2><span class="ln"></span><span class="c">pick one</span></div>'+
    '<div class="tools">'+SKINS.map(function(s){
      return '<button class="tbtn" data-skin2="'+s+'">'+s+'</button>'; }).join('')+'</div>'+

    '<div class="sh"><h2>You</h2><span class="ln"></span><span class="c">'+esc(S.me.email||'')+'</span></div>'+
    '<label class="fld"><span class="lab">Display name</span><input id="pName" value="'+esc(S.me.display_name||'')+'"></label>'+
    '<label class="fld"><span class="lab">Birthday · powers the life grid</span><input id="pBirth" type="date" value="'+esc((S.priv0&&S.priv0.birth_date)||'')+'"></label>'+
    '<div class="tools"><button class="btn" id="pSave">Save profile</button></div>'+

    '<div class="sh"><h2>Take it with you</h2><span class="ln"></span><span class="c">outputs</span></div>'+
    '<div class="tools">'+
      '<button class="btn" id="xCsv">CSV · days</button>'+
      '<button class="btn" id="xCsvH">CSV · standards</button>'+
      '<button class="btn" id="xJson">JSON · everything</button>'+
      '<button class="btn" id="xPrint">Print report</button>'+
    '</div>'+

    '<div class="sh"><h2>Session</h2><span class="ln"></span><span class="c"></span></div>'+
    '<div class="tools"><button class="btn" id="bOut">Sign out</button></div>'+
    '<div class="note" style="padding:14px 0 0">Your data is yours. Every table is row-level locked to your account; nobody in a circle can see anything but a daily percentage.</div>';

  openOv('Settings',body,function(){
    var list=el('edList');
    paintBudget();
    list.addEventListener('input',paintBudget);
    list.addEventListener('change',paintBudget);
    list.addEventListener('click',function(e){
      var rm=e.target.closest('[data-rm]'), up=e.target.closest('[data-up]');
      if(rm){ var r=rm.closest('.ed'); r.classList.toggle('gone'); }
      if(up){ var r2=up.closest('.ed'), pv=r2.previousElementSibling; if(pv) list.insertBefore(r2,pv); }
    });
    var add=function(){
      var d=document.createElement('div'); d.innerHTML=edRow({name:'',minutes:0,group_name:'Standards',cadence:'daily'},999);
      list.appendChild(d.firstChild);
      list.lastChild.querySelector('.en').focus();
      list.lastChild.scrollIntoView({block:'center'});
    };
    el('edAdd').onclick=add; el('edAdd2').onclick=add;
    el('edSave').onclick=saveStandards; el('edSave2').onclick=saveStandards;
    el('edStrip').onclick=function(){
      var n=0;
      Array.prototype.forEach.call(list.querySelectorAll('.en'),function(inp){
        var v=label(inp.value); if(v!==inp.value){ inp.value=v; n++; }
      });
      toast(n?('stripped '+n+' — now save'):'nothing to strip');
    };
    el('pSave').onclick=saveProfile;
    el('xCsv').onclick=function(){ dl('ht-days.csv', csvDays()); };
    el('xCsvH').onclick=function(){ dl('ht-standards.csv', csvHabits()); };
    el('xJson').onclick=function(){
      /* R35.6 — day_private carries inputs 2 and 3. Exporting completion alone and calling it
         EVERYTHING is how a backup becomes a belief. */
      var priv=[]; for(var k in S.privAll){ if(S.privAll[k]) priv.push(S.privAll[k]); }
      priv.sort(function(a,b){ return a.date<b.date?-1:1; });
      dl('ht.json', JSON.stringify({ profile:S.me, habits:S.habits, days:S.days,
        day_private:priv, exported_at:new Date().toISOString(), schema:'ht-export-2' },null,2));
    };
    el('xPrint').onclick=function(){ closeOv(); setTimeout(function(){ window.print(); },260); };
    el('bOut').onclick=async function(){ await sb.auth.signOut(); location.reload(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-skin2]'),function(b){
      b.onclick=function(){ skin(b.getAttribute('data-skin2')); };
    });
  });
}
/* the list is a time budget; show the bill while it is being written */
function paintBudget(){
  var rows=Array.prototype.slice.call(document.querySelectorAll('#edList .ed'));
  var dMin=0,dN=0,wMin=0,wN=0,free=0;
  rows.forEach(function(r){
    if(r.classList.contains('gone')) return;
    if(!r.querySelector('.en').value.trim()) return;
    var m=+r.querySelector('.em').value||0, wk=r.querySelector('.ec').value==='weekly';
    if(wk){ wN++; wMin+=m; } else { dN++; dMin+=m; }
    if(!m) free++;
  });
  var WAKE=1440-480;                                  /* a day, less eight hours of sleep */
  var pct=Math.min(100,Math.round(dMin/WAKE*100));
  var level = dMin>420 ? 'over' : dMin>240 ? 'watch' : 'ok';
  var col = level==='over'?'var(--bad)':level==='watch'?'var(--g3)':'var(--good)';
  var verdict = level==='over'
    ? 'More routine than a working day has room for. A list this size gets scored by the clock, not by you.'
    : level==='watch' ? 'Getting heavy. Every minute here is a minute the day has to find somewhere else.'
    : 'This fits inside a real day.';
  el('bud').innerHTML =
    '<div class="lab">Daily time budget</div>'+
    '<div class="v" style="color:'+col+'">'+fmt(dMin)+' <span style="font-size:11px;color:var(--ink3)">of '+fmt(WAKE)+' waking</span></div>'+
    '<div class="t"><i style="width:'+pct+'%;background:'+col+'"></i>'+
      '<u style="left:'+Math.round(240/WAKE*100)+'%"></u><u style="left:'+Math.round(420/WAKE*100)+'%"></u></div>'+
    '<div class="k">'+dN+' daily'+(wN?' · '+wN+' weekly ('+fmt(wMin)+'/wk)':'')+
      (free?' · '+free+' cost no time':'')+'. '+verdict+'</div>';
}

async function saveStandards(){
  var rows=Array.prototype.slice.call(document.querySelectorAll('#edList .ed'));
  var order=0, ops=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i], id=(S.edSrc||[])[+r.getAttribute('data-i')] || null;
    var name=r.querySelector('.en').value.trim();
    var rec={ user_id:S.me.id, name:name,
      minutes:+r.querySelector('.em').value||0,
      group_name:r.querySelector('.eg').value,
      cadence:r.querySelector('.ec').value,
      sort_order:order++ };
    if(S.hasCue){ var qn=r.querySelector('.eq'); rec.cue = qn ? qn.value.trim() : ''; }
    if(r.classList.contains('gone')){
      if(id) ops.push(sb.from('habits').update({active:false,archived_at:new Date().toISOString()}).eq('id',id.id));
      continue;
    }
    if(!name) continue;
    if(id) ops.push(sb.from('habits').update(rec).eq('id',id.id));
    else    ops.push(sb.from('habits').insert(rec));
  }
  await Promise.all(ops);
  toast('standards saved'); closeOv(); await load(); paintAll();
}
async function saveProfile(){
  var n=el('pName').value.trim(), b=el('pBirth').value||null;
  S.me.display_name=n;
  await sb.from('profiles').update({display_name:n}).eq('id',S.me.id);
  /* HT-13 B1: birthdate and target age are the life graph's two inputs and they live in the
     owner-only table, never in `profiles`. The field is only read when its column exists. */
  var rec={ id:S.me.id, birth_date:b };
  var tn=el('pTarget'), t=null;
  if(S.hasTargetAge && tn){ t = tn.value===''? null : clamp(+tn.value||0, 1, 120); rec.target_age=t; }
  await sb.from('profile_private').upsert(rec,{onConflict:'id'});
  S.priv0=S.priv0||{}; S.priv0.birth_date=b;
  if(S.hasTargetAge && tn) S.priv0.target_age=t;
  toast('profile saved'); paintLife();
  if(window.__HT13_REPAINT) window.__HT13_REPAINT();
}

/* ---- the guide: what every number on the sheet means ---- */
function openGuide(){
  openOv('What everything means',
  '<div class="band">The three inputs</div>'+
  gd('1 · Completion','Ticking a standard. Your day percentage is simply how many of the daily standards you took, out of how many are active. Weekly standards are credited to the whole Monday–Sunday week, so taking one on Tuesday keeps the week green.')+
  gd('2 · Rating','Your own 1–10 on the day, before you look at the score. It is the only number here you cannot game, because nothing computes it.')+
  gd('3 · Journal','Why it was that number, what you actually got done, and the prayer journal. Three free-text fields, saved per day.')+
  '<div class="band">Everything else is an output</div>'+
  gd('Where the day goes','The committed block is the sum of the minutes you priced your daily standards at. The top bar splits it by group; the bottom bar splits the same minutes into what you did and what you missed. The ribbons show which group the missed time came from.')+
  gd('Cost against adherence','Every priced standard is one dot: minutes on the horizontal, how often you actually take it on the vertical. It is testing one excuse — <b>am I missing things because they are expensive?</b> If the cloud slopes down to the right, price is the problem and the fix is to shorten or cut. If it is flat, price is not the problem, and cutting minutes will not help.')+
  gd('Rating against completion','The same test on the other side. Does hitting the standard make the day feel better? A positive correlation means the routine is earning its cost. A flat one means the list is not touching what actually makes your day good.')+
  gd('Momentum','This 7 days against the 7 before it. The projection just carries the same change forward one more week — it is arithmetic, not a forecast.')+
  gd('Streaks','Current run of consecutive days taken, then the longest run in the last 90. Today does not break a streak until the day closes.')+
  gd('Next move','Room to gain divided by what it costs. The standard with the most missing days at the lowest price — the cheapest points on the board.')+
  gd('Time ledger','Committed minutes per day multiplied by days logged is what the routine billed you. Spent is what you actually took. The difference is the unspent balance — not wasted time, just time the list asked for and did not get.')+
  gd('Grades','A+ 97, A 90, B 80, C 70, D 60, F below. The colour ramp is continuous, not banded, so a 45 and a 62 do not look the same.'),
  null);
}
function gd(t,b){ return '<div style="padding:12px 0;border-bottom:1px solid var(--rule)">'+
  '<div class="lab" style="padding-bottom:5px">'+t+'</div><div class="note">'+b+'</div></div>'; }

/* ---- circle manage ---- */
function openCircle(){
  openOv('Circle',
    '<div class="note" style="padding:8px 0 14px">A circle shows one number per person per day. Nothing else crosses.</div>'+
    '<label class="fld"><span class="lab">Join with a code</span><input id="cCode" placeholder="ABC123" autocapitalize="characters"></label>'+
    '<div class="tools"><button class="btn" id="cJoin">Join</button></div>'+
    '<label class="fld" style="margin-top:14px"><span class="lab">Or start one</span><input id="cName" placeholder="Name it"></label>'+
    '<div class="tools"><button class="btn pri" id="cMake">Create</button></div>'+
    '<div class="note" id="cMsg" style="padding-top:14px"></div>',
    function(){
      el('cJoin').onclick=async function(){
        var code=(el('cCode').value||'').trim().toUpperCase(); if(!code) return;
        try{ var r=await sb.rpc('join_circle',{code:code});
          if(r.error) throw r.error;
          closeOv(); await paintCircle(); toast('joined');
        }catch(e){ el('cMsg').textContent='No circle with that code.'; }
      };
      el('cMake').onclick=async function(){
        var n=(el('cName').value||'').trim(); if(!n) return;
        var code=Math.random().toString(36).slice(2,8).toUpperCase();
        var c=await sb.from('circles').insert({name:n,join_code:code,owner:S.me.id}).select('id').single();
        if(c.error){ el('cMsg').textContent='Could not create it.'; return; }
        await sb.from('circle_members').insert({circle_id:c.data.id,user_id:S.me.id});
        closeOv(); await paintCircle(); toast('code '+code);
      };
    });
}

/* ---- exports ---- */
function csvDays(){
  var ids=S.habits.map(function(h){return h.id;});
  var head=['date','pct','grade','rating'].concat(S.habits.map(function(h){return '"'+label(h.name).replace(/"/g,'""')+'"';}));
  var out=[head.join(',')];
  dates().forEach(function(k){
    var r=S.byDate[k], ck=r.checked||{};
    out.push([k, r.pct==null?'':r.pct, r.pct==null?'':grade(r.pct)[0], (ratingOf(k)==null?'':ratingOf(k))]
      .concat(ids.map(function(i){return ck[i]?1:0;})).join(','));
  });
  return out.join('\n');
}
function csvHabits(){
  var out=['name,group,cadence,minutes,adherence_30d,current_streak,longest_streak'];
  stats().forEach(function(s){
    out.push('"'+label(s.h.name).replace(/"/g,'""')+'",'+(s.h.group_name||'')+','+
      (s.h.cadence||'daily')+','+(s.h.minutes||0)+','+(s.pct==null?'':s.pct)+','+s.cur+','+s.best);
  });
  return out.join('\n');
}
function dl(name,text){
  var b=new Blob([text],{type:'text/plain'}), u=URL.createObjectURL(b);
  var a=document.createElement('a'); a.href=u; a.download=name; a.click();
  setTimeout(function(){URL.revokeObjectURL(u);},1200);
  toast('exported');
}

/* ============================ auth ============================ */
function authScreen(){
  document.querySelector('.app').innerHTML=
    '<div style="max-width:340px;margin:16vh auto 0;padding:0 4px">'+
    '<div class="wm" style="font-size:15px">HT<b>.</b></div>'+
    '<div class="note" style="padding:10px 0 22px">A ledger of the self. One number a day, and nowhere to hide.</div>'+
    '<label class="fld"><span class="lab">Email</span><input id="aEmail" type="email" autocomplete="email"></label>'+
    '<label class="fld"><span class="lab">Password</span><input id="aPass" type="password" autocomplete="current-password"></label>'+
    '<div class="tools" style="padding-top:14px"><button class="btn pri" id="aIn" style="flex:1">Sign in</button>'+
    '<button class="btn" id="aUp">Create</button></div>'+
    '<div class="note" id="aMsg" style="padding-top:12px"></div></div>';
  var msg=function(t){ el('aMsg').textContent=t; };
  var go=async function(kind){
    var e=el('aEmail').value.trim(), p=el('aPass').value;
    if(!e||!p){ msg('Email and password.'); return; }
    msg('…');
    var r = kind==='up' ? await sb.auth.signUp({email:e,password:p})
                        : await sb.auth.signInWithPassword({email:e,password:p});
    if(r.error){ msg(r.error.message); return; }
    if(kind==='up' && !r.data.session){ msg('Check your email to confirm, then sign in.'); return; }
    location.reload();
  };
  el('aIn').onclick=function(){go('in');};
  el('aUp').onclick=function(){go('up');};
  el('aPass').onkeydown=function(e){ if(e.key==='Enter') go('in'); };
}

/* ============================ paint all ============================ */
function paintAll(){
  paintMast(); paintRail(); paintLog(); paintRating(); paintJournalInputs();
  paintCapacity(); paintNextSmall(); paintKpi();
  paintStarter(); paintWeekly(); paintMcII(); paintYear(); paintPredict();
  paintRight(); paintCircle();
}

function goDay(k){
  S.date=k;
  if(!S.byDate[k]) S.byDate[k]={date:k,checked:{},pct:0};
  S.priv=S.privAll[k]||null;
  var d=dnum(k); S.calYM=[d.getFullYear(),d.getMonth()];
  paintMast(); paintRail(); paintLog(); paintRating(); paintJournalInputs(); paintSankey(); paintCal();
  paintCapacity(); paintNextSmall(); paintWeekly(); paintYear(); paintPredict();
  var t=el('jIn'); if(t && window.innerWidth<1080) window.scrollTo({top:Math.max(0,t.offsetTop-70),behavior:'smooth'});
}

/* ============================ events ============================ */
function wire(){
  el('skins').addEventListener('click',function(e){
    var b=e.target.closest('[data-skin]'); if(b) skin(b.getAttribute('data-skin'));
  });
  el('bSet').onclick=openSettings;
  var bv=el('bView'); if(bv) bv.onclick=toggleView;
  var yp=el('yPrev'), yn=el('yNext');
  if(yp) yp.onclick=function(){ S.yearY=(S.yearY==null?dnum(today()).getFullYear():S.yearY)-1; paintYear(); };
  if(yn) yn.onclick=function(){ S.yearY=(S.yearY==null?dnum(today()).getFullYear():S.yearY)+1; paintYear(); };
  document.body.classList.toggle('reviewday', [0,1].indexOf(dnum(today()).getDay())>=0);
  applyView(loadView());
  el('bGuide').onclick=openGuide;
  el('bCircle').onclick=openCircle;

  /* input 2 — rating */
  el('rate').addEventListener('click',function(e){
    var b=e.target.closest('[data-r]'); if(!b) return;
    var v=+b.getAttribute('data-r');
    S.priv=S.priv||{};
    S.priv.rating = (v===0 || S.priv.rating===v) ? null : v;
    paintRating(); queuePriv();
  });
  /* input 3 — journal */
  [['iWhy','why'],['iTasks','tasks'],['iPrayer','prayer']].forEach(function(p){
    var n=el(p[0]);
    n.addEventListener('input',function(){
      S.priv=S.priv||{}; S.priv[p[1]]=n.value; queuePriv();
      el('jrnC').textContent='saving…';
    });
  });

  /* month calendar */
  el('calNav').addEventListener('click',function(e){
    var b=e.target.closest('[data-cm]'); if(!b) return;
    var d=+b.getAttribute('data-cm'), m=S.calYM[1]+d, y=S.calYM[0];
    if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
    S.calYM=[y,m]; paintCal();
  });
  el('calMode').addEventListener('click',function(e){
    var b=e.target.closest('[data-m]'); if(!b) return;
    S.calMode=b.getAttribute('data-m');
    Array.prototype.forEach.call(el('calMode').children,function(c){ c.classList.toggle('on',c===b); });
    paintCal();
  });
  el('cal').addEventListener('click',function(e){
    var b=e.target.closest('[data-cd]'); if(!b) return;
    var k=b.getAttribute('data-cd'); if(k>today()) return;
    goDay(k);
  });
  el('jArc').addEventListener('click',function(e){
    var b=e.target.closest('[data-jd]'); if(b) goDay(b.getAttribute('data-jd'));
  });
  el('ov').addEventListener('click',function(e){ if(e.target.closest('[data-x]')) closeOv(); });

  el('rail').addEventListener('click',function(e){
    var b=e.target.closest('[data-d]'); if(b) goDay(b.getAttribute('data-d'));
  });

  el('log').addEventListener('click',function(e){
    var b=e.target.closest('[data-h]'); if(!b) return;
    /* HT-16 R70.98: the name IS the link now. It navigates itself; it must never also toggle. */
    if(e.target.closest('a')) return;
    if(e.target.closest('.lk')){
      var h=S.habits.filter(function(x){return x.id===b.getAttribute('data-h');})[0];
      if(h&&h.link){ window.open(h.link,'_blank','noopener'); return; }
    }
    toggle(b.getAttribute('data-h'));
  });

  el('grpSeg').addEventListener('click',function(e){
    var b=e.target.closest('[data-g]'); if(!b) return;
    S.grp=b.getAttribute('data-g');
    Array.prototype.forEach.call(el('grpSeg').children,function(c){ c.classList.toggle('on',c===b); });
    paintLog();
  });
  el('sortSeg').addEventListener('click',function(e){
    var b=e.target.closest('[data-s]'); if(!b) return;
    S.sort=b.getAttribute('data-s');
    Array.prototype.forEach.call(el('sortSeg').children,function(c){ c.classList.toggle('on',c===b); });
    paintLog();
  });
  el('find').addEventListener('input',function(){ S.find=this.value; paintLog(); });
  el('bAllOff').onclick=function(){
    if(!confirm('Clear every mark on '+S.date+'?')) return;
    S.byDate[S.date].checked={}; queueSave(); paintMast(); paintLog(); paintRail(); paintRight();
  };
  el('bClose').onclick=async function(){
    await saveDay({close:true}); await load(); paintAll();     /* HT-13 G2: the explicit close */
    var p=S.byDate[S.date].pct;
    toast('closed · '+fmt(earned(S.date))+' earned · '+p+'% · '+grade(p)[0]);
    /* R-B rides this action: one optional tap, about tomorrow. */
    var n=el('predict');
    if(n && S.hasPredict){ n.scrollIntoView({behavior:'smooth',block:'center'}); }
  };

  el('jump').addEventListener('click',function(e){
    var b=e.target.closest('[data-j]'); if(!b) return;
    Array.prototype.forEach.call(el('jump').children,function(c){ c.classList.toggle('on',c===b); });
    var t=el(b.getAttribute('data-j'));
    if(t) window.scrollTo({ top: t.offsetTop-70, behavior:'smooth' });
  });

  /* keyboard — the desk, not the phone */
  document.addEventListener('keydown',function(e){
    if(/input|textarea|select/i.test((e.target.tagName||''))) {
      if(e.key==='Escape') e.target.blur();
      return;
    }
    if(e.key==='Escape'){ closeOv(); return; }
    if(e.key==='/'){ e.preventDefault(); el('find').focus(); return; }
    if(e.key==='['){ el('rail').querySelector('[data-d="'+shift(S.date,-1)+'"]')?.click(); return; }
    if(e.key===']'){ var n=shift(S.date,1); if(n<=today()) el('rail').querySelector('[data-d="'+n+'"]')?.click(); return; }
    if(e.key==='t'){ el('rail').querySelector('[data-d="'+today()+'"]')?.click(); return; }
    if(e.key==='s'){ openSettings(); return; }
    if(e.key==='?'||e.key==='g'){ openGuide(); return; }
    if(e.key==='j'){ el('iTasks').focus(); return; }
    if(e.key>='1'&&e.key<='9'){
      var rows=el('log').querySelectorAll('[data-h]'), i=+e.key-1;
      if(rows[i]) rows[i].click();
    }
  });

  var rT=null;
  window.addEventListener('resize',function(){
    clearTimeout(rT); rT=setTimeout(function(){
      paintSankey(); paintChart(); paintScatter(); paintRChart(); paintRScat(); paintLog(); },160);
  });

  window.addEventListener('scroll',function(){
    if(window.innerWidth>=1080) return;
    var ss=['jIn','jDay','jRec','jRate','jStand','jCircle'], cur=ss[0];
    ss.forEach(function(id){ var n=el(id); if(n && n.offsetTop-100<=window.scrollY) cur=id; });
    Array.prototype.forEach.call(el('jump').children,function(c){
      c.classList.toggle('on', c.getAttribute('data-j')===cur); });
  },{passive:true});
}


/* ==================================================================
   CAPACITY · SMALL VIEW · CUE · KPI BAND
   HT charter §1–§4, ruled by Cory 2026-08-31 (SPEC_QUEUE R35.7).
   Appended by _reconcile/ht_batch3/build_v3.py — one block, one place.
   ================================================================== */

/* ---- CAPACITY SCORE -------------------------------------------------
   Banded against CORY'S OWN trailing distribution, never population norms.
   Bands recompute WEEKLY (anchored to the last Sunday), never per-day: a
   single bad day must not flip a prescription. Until the calibration gate
   passes the band renders WITHOUT a prescription — a prescription from four
   datapoints is a guess wearing a uniform. */
var CAP_GATE = { ratedDays:14, loggedDays:30 };

function capFed(k){                       /* REAL logged days inside the 7-day window */
  /* load() puts a synthetic empty row in byDate for today so the sheet can render, and that row
     is NOT in S.days. Counting byDate would therefore call an unfed week "fed" every time —
     identity against S.days is what separates a persisted day from the placeholder. */
  var end=k||today(), n=0;
  for(var i=0;i<7;i++){
    var r=S.byDate[shift(end,-i)];
    if(r && S.days.indexOf(r)>=0) n++;
  }
  return n;
}
function capRaw(k){
  /* A GAP IS NOT A ZERO. With nothing logged in the window, adherence reads 0% and the score
     would say SHED LOAD — the exact wrong instruction for someone who simply stopped logging.
     Unfed returns null and the card says so. */
  if(capFed(k)===0) return null;
  var adh = rolling(7,k);                 /* 0..100 or null */
  var rat = rollRate(7,k);                /* 1..10  or null */
  if(adh==null && rat==null) return null;
  if(rat==null) return { v: adh/100, half:true };
  if(adh==null) return { v: (rat-1)/9,  half:true };
  return { v: 0.5*(adh/100) + 0.5*((rat-1)/9), half:false };
}
function capWeekAnchor(){
  var d=dnum(today()); d.setDate(d.getDate()-d.getDay());   /* last Sunday */
  return dk(d);
}
function capBands(){
  var anchor=capWeekAnchor(), vals=[];
  for(var i=0;i<60;i++){
    var k=shift(anchor,-i), r=S.byDate[k]?capRaw(k):null;
    if(r) vals.push(r.v);
  }
  if(vals.length<8) return null;
  vals.sort(function(a,b){return a-b;});
  var q=function(p){ return vals[clamp(Math.floor(p*(vals.length-1)),0,vals.length-1)]; };
  return { p33:q(0.33), p66:q(0.66), n:vals.length, anchor:anchor };
}
function capState(){
  var rated=0, logged=dates().length;
  for(var k in S.privAll){ if(ratingOf(k)!=null) rated++; }
  var raw=capRaw(today());
  var b=capBands();
  /* half-fed input can never carry a prescription, however many days are on file:
     a capacity score computed from completion alone is adherence wearing a uniform. */
  var fed = capFed();
  var calibrated = (rated>=CAP_GATE.ratedDays && logged>=CAP_GATE.loggedDays && !!b && !!raw
                    && !raw.half && fed>=4);
  var band=null;
  if(raw && b) band = raw.v < b.p33 ? 'SHED LOAD' : (raw.v > b.p66 ? 'TAKE IT ON' : 'HOLD');
  return { raw:raw, bands:b, band:band, calibrated:calibrated, rated:rated, logged:logged,
           fed: fed,
           score: raw? Math.round(raw.v*100) : null,
           needRated: Math.max(0, CAP_GATE.ratedDays-rated),
           needLogged: Math.max(0, CAP_GATE.loggedDays-logged) };
}
function paintCapacity(){
  var n=el('cap'); if(!n) return;
  var c=capState();
  if(c.score==null){
    var gap=(c.logged>0 && capFed()===0);
    n.innerHTML='<div class="capc"><div class="capn">—</div><div class="capw">'+
      (gap?'UNFED · nothing logged in 7 days':'Capacity needs a logged day')+'</div>'+
      '<div class="caps">'+(gap
        ? 'A gap is not a zero, so this shows nothing rather than telling you to shed load. Tick today and it comes back.'
        : 'Tick something above and this fills in.')+'</div></div>'; return;
  }
  var wordy = c.calibrated
    ? '<b>'+c.band+'</b> · banded against your own last '+c.bands.n+' days'
    : 'UNCALIBRATED · '+(c.needRated?('needs '+c.needRated+' more rated day'+(c.needRated>1?'s':'')):'')+
      (c.needRated&&c.needLogged?' and ':'')+
      (c.needLogged?(c.needLogged+' more logged day'+(c.needLogged>1?'s':'')):'')+
      ' before it may prescribe';
  /* SAY THE SAMPLE SIZE. A bare number off one logged day reads as a verdict on the man
     rather than on the day. */
  var sub = (c.raw.half
    ? 'Half-fed: this is completion only. The rating half of the formula is empty.'
    : 'Completion and self-rating, 7-day, weighted half and half.')
    + ' Built from ' + c.fed + ' of the last 7 days.'
    + (c.fed<=2 ? ' That is a thin week — this number is about the logging, not about you.' : '');
  if(!c.calibrated && c.fed<4 && c.needRated===0 && c.needLogged===0){
    wordy = 'UNCALIBRATED · only '+c.fed+' of the last 7 days logged — it will not prescribe off a thin window';
  }
  n.innerHTML='<div class="capc'+(c.calibrated?' ok':'')+'">'+
    '<div class="capn num">'+c.score+'</div>'+
    '<div class="capw">'+wordy+'</div>'+
    '<div class="caps">'+sub+'</div></div>';
}

/* ---- NEXT MOVE, shared ranking (small view + full sheet) ---- */
function nextMoveRank(){
  var a=stats().filter(function(s){ return s.pct!=null && s.h.cadence!=='weekly'; });
  a.forEach(function(s){ s.lev=(100-s.pct)/((s.mins||0)+10); });
  a.sort(function(x,y){ return y.lev-x.lev; });
  return a;
}
function paintNextSmall(){
  var n=el('capNext'); if(!n) return;
  var a=nextMoveRank();
  if(!a.length){ n.innerHTML='<div class="empty">Log a few days and the next move appears here.</div>'; return; }
  var b=a[0];
  n.innerHTML='<div class="nms"><span class="k">Next move</span>'+
    '<span class="v">'+esc(label(b.h.name))+'</span>'+
    '<span class="s">'+b.pct+'% over '+b.of+' days · '+(b.mins?b.mins+' min':'no time')+'</span></div>';
}

/* ---- SMALL DEFAULT VIEW ---------------------------------------------
   Default is SMALL. 13 logged days cannot feed 18 instruments, and a wall
   of empty charts is work at 4:50am. The wall is one tap away, never gone
   (nothing here re-opens DEC-055). */
function loadView(){
  try { return localStorage.getItem('ht_view')==='full' ? 'full' : 'small'; }
  catch(e){ return 'small'; }
}
function applyView(v){
  S.view = (v==='full')?'full':'small';
  document.body.classList.toggle('small', S.view==='small');
  var b=el('bView'); if(b) b.textContent = (S.view==='small') ? 'Full sheet' : 'Small view';
  try { localStorage.setItem('ht_view', S.view); } catch(e){}
  if(S.view==='full'){ paintRight(); }
}
function toggleView(){ applyView(S.view==='small'?'full':'small'); }

/* ---- KPI BAND — config-driven, ships DARK ---------------------------
   x32: the business measures are DERIVED from GOAL MATH, never hand-picked,
   and R35.7 HOLDS them until GOAL_MATH.md locks. So the band is built and
   wired, hard-codes nothing, and renders nothing until a config arrives.
   To light it: set enabled:true and give measures[] {name,minutes,target}. */
function paintKpi(){
  var n=el('kpi'); if(!n) return;
  if(!HT_KPI.enabled || !(HT_KPI.measures||[]).length){ n.innerHTML=''; n.style.display='none'; return; }
  n.style.display='';
  n.innerHTML='<div class="sh"><h2>Lead measures</h2><span class="ln"></span><span class="c">'+
    esc(HT_KPI.source||'')+'</span></div><div class="pan"><div class="kpil">'+
    HT_KPI.measures.map(function(m){
      return '<div class="kpim"><span class="k">'+esc(m.name)+'</span>'+
             '<span class="v num">'+(m.target==null?'—':esc(String(m.target)))+'</span>'+
             '<span class="s">'+(m.minutes?m.minutes+' min/day':'')+'</span></div>';
    }).join('')+'</div></div>';
}


/* ==================================================================
   HT-5 — streak repair · MCII · weekly review · forfeit (dark) ·
   year view · cue coverage · miss flags · 90-day consistency ·
   60-second onboarding.
   R46.5 pile-in, additive only. NO fourth daily input (R47.1/DEC-058):
   every surface below is derived output or a one-off config write.
   ================================================================== */

/* ---- FORFEIT REFEREE — built, config-driven, DARK until Phase D ----
   The self-refereed commitment device never fired (the $250/11-texts).
   PENDING-SPEC-15 §10: the escalation must be STRUCTURAL, not discretionary.
   So the referee is a config with a trigger the machine evaluates — and it
   ships disabled, like the KPI band, until Phase D lets anything fire. */
var HT_FORFEIT = { enabled:false, referee:null, stake:null,
                   trigger:{ missRun:3, weeklyBelow:null }, note:'dark until Phase D (DEC-068)' };

/* ---- STREAK REPAIR -------------------------------------------------
   Bounded freeze budget + isolated-miss forgiveness. Derived from the
   existing rows — no column, no new input. A streak that a single missed
   day destroys is a loss-aversion device sitting at zero; it punishes the
   record-keeping, not the man. */
var STREAK = { freezePer30:2, formedAt:66 };   /* 66 = the median automaticity figure */

function loggedOn(k){ var r=S.byDate[k]; return !!(r && S.days.indexOf(r)>=0); }
function streakForgiving(){
  /* walks back from today; an unlogged or sub-80 day spends a freeze instead of
     ending the run, up to freezePer30 inside any trailing 30 days. */
  var k=today(), n=0, spent=[], guard=0;
  if(!loggedOn(k)) k=shift(k,-1);
  while(guard++<400){
    var r=S.byDate[k], pct=(r&&r.pct!=null)?r.pct:null;
    if(pct!=null && pct>=80){ n++; }
    else {
      /* the budget must be bounded by the RUN, not by a window that slides away underneath it:
         a per-30-days test evaluated at each step lets old freezes expire and the streak runs
         forever (rehearsal exhibit: 21 freezes spent against a budget of 2). Allowance grows one
         block at a time as the run itself grows. */
      var allowed = STREAK.freezePer30 * (1 + Math.floor(n/30));
      if(spent.length >= allowed) break;
      spent.push(k);
      n++;                                   /* the day is carried, not counted as a win */
    }
    k=shift(k,-1);
  }
  return { days:n, frozen:spent.length, budget:STREAK.freezePer30 };
}
function missRun(hid){                        /* consecutive missed days, ending today */
  var k=today(), n=0, guard=0, h=null;
  for(var i=0;i<S.habits.length;i++) if(S.habits[i].id===hid) h=S.habits[i];
  if(!h || h.cadence==='weekly') return 0;
  while(guard++<120){
    if(!loggedOn(k)){ k=shift(k,-1); continue; }
    if(doneOn(h,k)) break;
    n++; k=shift(k,-1);
  }
  return n;
}
function automaticity(hid){                   /* PENDING-SPEC-15: formation is a count, not a feeling */
  var done=0, first=null;
  dates().forEach(function(k){ if(ckOf(k)[hid]){ done++; if(!first) first=k; } });
  return { done:done, first:first, formed:done>=STREAK.formedAt,
           pct:Math.min(100, Math.round(done/STREAK.formedAt*100)) };
}

/* ---- 90-DAY CONSISTENCY --------------------------------------------
   PENDING-SPEC-15 §2: rank and frame on CONSISTENCY over 90 days —
   frequency of completion — never on intensity or on the day-rating.
   Denominator is calendar days, so silence counts. That is the point. */
function consistency(n){
  var end=today(), hit=0, logged=0;
  for(var i=0;i<n;i++){
    var k=shift(end,-i), r=S.byDate[k];
    if(r && r.pct!=null && loggedOn(k)){ logged++; if(r.pct>=80) hit++; }
  }
  return { hit:hit, logged:logged, of:n, pct:Math.round(hit/n*100) };
}

/* ---- WEEKLY REVIEW — the Monday-seven feed ------------------------- */
function weekWindow(off){
  var d=dnum(today()); d.setDate(d.getDate()-d.getDay()-7*(off||0));
  var start=dk(d), a=[];
  for(var i=0;i<7;i++) a.push(shift(start,i));
  return a;
}
function weekStats(off){
  var ks=weekWindow(off), pcts=[], rats=[], jr=0, lg=0;
  ks.forEach(function(k){
    if(k>today()) return;
    var r=S.byDate[k];
    if(r && r.pct!=null && loggedOn(k)){ pcts.push(r.pct); lg++; }
    var v=ratingOf(k); if(v!=null) rats.push(v);
    var p=S.privAll[k]; if(p && (p.why||p.tasks||p.prayer)) jr++;
  });
  var avg=function(a){ return a.length? Math.round(a.reduce(function(x,y){return x+y;},0)/a.length*10)/10 : null; };
  return { logged:lg, adh:pcts.length?Math.round(avg(pcts)):null, rating:avg(rats), journal:jr, days:ks };
}
function paintWeekly(){
  var n=el('weekly'); if(!n) return;
  var a=weekStats(0), b=weekStats(1), c90=consistency(90);
  var flags=S.habits.filter(function(h){ return missRun(h.id)>=3; })
                    .map(function(h){ return { h:h, run:missRun(h.id) }; })
                    .sort(function(x,y){ return y.run-x.run; });
  var st=stats().filter(function(s){ return s.pct!=null && s.h.cadence!=='weekly'; })
                .sort(function(x,y){ return x.pct-y.pct; });
  var d=function(now,prev,suf){
    if(now==null) return '—';
    if(prev==null) return now+(suf||'');
    var v=Math.round((now-prev)*10)/10;
    return now+(suf||'')+' <s>'+(v>0?'+':'')+v+' vs last week</s>';
  };
  n.innerHTML=
    '<div class="wkrow">'+
      tp('Logged', a.logged+'<s>of 7</s>')+
      tp('Adherence', d(a.adh,b.adh,'%'))+
      tp('Rating', d(a.rating,b.rating,''))+
      tp('Journal', a.journal+'<s>of 7 days</s>')+
      tp('90-day consistency', c90.pct+'%<s>'+c90.hit+' days at 80%+</s>')+
      tp('Gaps', (function(){ var g=gaps(7); return g.missed+'<s>of 7 days</s>'; })())+
      tp('Called right', (function(){ var r=predictionRecord(30);
          return (r.made? r.kept+'<s>of '+r.made+' calls</s>' : '—<s>no calls</s>'); })())+
    '</div>'+
    (flags.length
      ? '<div class="flags"><span class="k">Off track — 3+ days running</span>'+
        flags.slice(0,6).map(function(f){
          return '<div class="fl"><span>'+esc(label(f.h.name))+'</span><b>'+f.run+' days</b></div>'; }).join('')+
        '<div class="s">Three consecutive misses is a structural flag, not a judgement — the standard '+
        'is either wrong, mis-cued, or genuinely dropped. Decide which at review.</div></div>'
      : '<div class="flags"><span class="k">Off track — 3+ days running</span>'+
        '<div class="s">Nothing is three days down. </div></div>')+
    (function(){ var rt=returnsIn(weekWindow(0));
      return rt.length
        ? '<div class="flags"><span class="k">Came back this week</span>'+
          rt.slice(0,6).map(function(r){ return '<div class="fl"><span>'+esc(label(r.h.name))+
            '</span><b>'+r.n+'×</b></div>'; }).join('')+
          '<div class="s">Returning after a miss is the most strongly evidenced move in this whole '+
          'ledger — it beats never having missed, because nobody sustains never.</div></div>'
        : ''; })()+
    '<div class="wk2"><div><span class="k">Weakest</span>'+
      st.slice(0,3).map(function(s){ return '<div class="fl"><span>'+esc(label(s.h.name))+'</span><b>'+s.pct+'%</b></div>'; }).join('')+
    '</div><div><span class="k">Strongest</span>'+
      st.slice(-3).reverse().map(function(s){ return '<div class="fl"><span>'+esc(label(s.h.name))+'</span><b>'+s.pct+'%</b></div>'; }).join('')+
    '</div></div>';
}

/* ---- MCII — rides the existing journal `why`, once a week ----------
   Implementation intentions with the obstacle named. It is a PROMPT on an
   existing field on one day a week, never a new field: DEC-058 holds. */
function isMcIIDay(){ return dnum(today()).getDay()===0; }   /* Sunday: set the week */
function paintMcII(){
  var n=el('mcii'); if(!n) return;
  if(!isMcIIDay()){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  n.innerHTML='<div class="mc"><span class="k">Sunday — set the week</span>'+
    '<div class="s">In the box below: <b>what do you want this week</b>, then <b>the obstacle</b> '+
    'that will actually get in the way, then <b>when-then</b> — "when &lt;obstacle&gt; happens, I will &lt;action&gt;". '+
    'Wanting it and naming what blocks it beats wanting it alone.</div></div>';
  var w=el('iWhy'); if(w && !w.value) w.placeholder='I want… · What gets in the way… · When that happens, I will…';
}

/* ---- YEAR VIEW ---------------------------------------------------- */
function paintYear(){
  var n=el('yearGrid'); if(!n) return;
  var y=(S.yearY==null? dnum(today()).getFullYear() : S.yearY);
  var lab=el('yearLab'); if(lab) lab.textContent=y;
  var cells='', start=new Date(y,0,1), end=new Date(y,11,31), first0=dates()[0]||null;
  var pad=start.getDay();
  for(var i=0;i<pad;i++) cells+='<i class="yc pad"></i>';
  for(var d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    var k=dk(d), r=S.byDate[k], p=(r&&r.pct!=null&&loggedOn(k))?r.pct:null;
    var past=(k<today()), gap=(p==null && past && (!first0 || k>=first0));
    cells+='<i class="yc'+(gap?' gap':'')+'" title="'+k+(p==null?(gap?' · GAP — no entry':' · no entry'):' · '+p+'%')+
      '" style="background:'+(p==null?'var(--sunk)':dens(p))+'"></i>';
  }
  n.innerHTML=cells;
  var c=el('yearC');
  if(c){
    var got=dates().filter(function(k){ return k.slice(0,4)===String(y); }).length;
    c.textContent=got+' days logged in '+y;
  }
}

/* ---- CUE COVERAGE — every below-median standard --------------------- */
function belowMedian(){
  var a=stats().filter(function(s){ return s.h.cadence!=='weekly'; });
  var v=a.map(function(s){ return s.pct==null?0:s.pct; }).sort(function(x,y){ return x-y; });
  if(!v.length) return {};
  var med=v[Math.floor(v.length/2)], m={};
  a.forEach(function(s){ if((s.pct==null?0:s.pct)<=med) m[s.h.id]=1; });
  return m;
}
function cueCoverage(){
  var need=belowMedian(), n=0, got=0;
  S.habits.forEach(function(h){ if(need[h.id]){ n++; if(h.cue) got++; } });
  return { need:n, got:got };
}

/* ---- 60-SECOND ONBOARDING — defaults, one action, no tour ----------
   PENDING-SPEC-15 §7/§8: first value inside 60 seconds; an empty state must
   state status, teach in place, and offer one direct path to populate.
   A stranger ticks a real standard within seconds of arriving. */
var STARTER = [
  { name:'Move for 20 minutes', minutes:20, group_name:'Morning', cadence:'daily' },
  { name:'Read 10 pages',        minutes:15, group_name:'Other',   cadence:'daily' },
  { name:'Lights out by 10:30',  minutes:0,  group_name:'Night',   cadence:'daily' }
];
function paintStarter(){
  var n=el('starter'); if(!n) return;
  if(S.habits.length){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  n.innerHTML='<div class="st1"><span class="k">Start here</span>'+
    '<div class="s">Three standards to begin with. Tick one tonight and you have used this properly. '+
    'Change them, delete them, add your own — later, in Settings.</div>'+
    STARTER.map(function(s){ return '<div class="fl"><span>'+esc(s.name)+'</span><b>'+
      (s.minutes?s.minutes+'m':'—')+'</b></div>'; }).join('')+
    '<div class="tools" style="padding-top:10px"><button class="btn pri" id="stGo">Start with these three</button></div></div>';
  var b=el('stGo');
  if(b) b.onclick=async function(){
    b.disabled=true; b.textContent='adding…';
    var ops=STARTER.map(function(s,i){
      return sb.from('habits').insert({ user_id:S.me.id, name:s.name, minutes:s.minutes,
        group_name:s.group_name, cadence:s.cadence, sort_order:i });
    });
    await Promise.all(ops);
    await load(); paintAll(); toast('three standards added — tick one');
  };
}


/* ==================================================================
   HT-6 — the five S-cost self-layer rocks (SPEC ruling R67).
   R-C showed-up streak · R-B self-prediction · R-D gain framing ·
   R-A miss-return reward · R-E missing day as a scored event.
   Additive. No new DAILY input surface: R-B is one optional tap on the
   existing close-the-day action, and it degrades to nothing when its
   column is absent.
   ================================================================== */

/* ---- R-C · SHOWED-UP STREAK ----------------------------------------
   Evidence: decoupling the streak from the performance target raised D14
   retention +3.3% and put +10.5% more daily users on a streak (Duolingo,
   A/B). The old streak keyed on >=80% and therefore measured the WRONG
   EVENT: it read 0 for weeks while days were being logged. The streak now
   counts the LOGGED day. The frozen-days budget is kept, unchanged, and
   now covers unlogged days only. */
function streakShowedUp(){
  var k=today(), n=0, spent=[], guard=0, first=dates()[0]||null;
  if(!loggedOn(k)) k=shift(k,-1);            /* today not logged yet is not a break */
  while(guard++<400){
    /* the walk stops where the ledger starts. Before the first logged day there is nothing to
       forgive, and spending freezes into pre-history inflates the streak past the record itself
       (rehearsal exhibit: 34 seeded days reported as 38). */
    if(first && k<first) break;
    if(loggedOn(k)){ n++; }
    else {
      /* budget bounded by the RUN, not by a sliding window (HT-5 exhibit) */
      var allowed = STREAK.freezePer30 * (1 + Math.floor(n/30));
      if(spent.length >= allowed) break;
      spent.push(k);
      n++;                                    /* carried, not counted as a win */
    }
    k=shift(k,-1);
  }
  return { days:n, frozen:spent.length, budget:STREAK.freezePer30, basis:'logged' };
}

/* ---- R-A · MISS-RETURN REWARD --------------------------------------
   Evidence: the winning arm of a 61,293-person / 54-arm megastudy rewarded
   people for RETURNING after a missed session (+0.40 weekly visits, +27%) —
   the best-evidenced mechanic in the whole scan. HT already forgave a miss;
   it never marked the return. Coming back is now the thing the ledger
   visibly credits. */
function prevLogged(k){
  for(var i=1;i<=60;i++){ var p=shift(k,-i); if(loggedOn(p)) return p; }
  return null;
}
function returnedOn(h,k){
  if(!h || h.cadence==='weekly') return false;
  if(!doneOn(h,k)) return false;
  var p=prevLogged(k);
  return !!p && !doneOn(h,p);                 /* done today, missed the last logged day */
}
function returnsIn(ks){
  var out=[];
  S.habits.forEach(function(h){
    var n=0;
    ks.forEach(function(k){ if(k<=today() && loggedOn(k) && returnedOn(h,k)) n++; });
    if(n) out.push({ h:h, n:n });
  });
  return out.sort(function(a,b){ return b.n-a.n; });
}

/* ---- R-E · A MISSING DAY IS A SCORED EVENT -------------------------
   Every product in eight categories treats a missing day as absence of
   data — the score just does not render. A gap is a result. It is counted,
   it is rendered, and it is named. */
function gaps(n){
  var end=today(), miss=0, first=dates()[0] || null;
  for(var i=1;i<=n;i++){                      /* i=1 — today is not yet a gap */
    var k=shift(end,-i);
    if(first && k<first) break;               /* before the ledger began is not a gap */
    if(!loggedOn(k)) miss++;
  }
  return { missed:miss, of:n, since:first };
}

/* ---- R-B · SELF-PREDICTION -----------------------------------------
   Evidence: self-prediction framing reaches g=0.25 where plain behaviour
   recording reaches g=0.07 — the largest legal upgrade in the scan, for one
   question. Asked ONCE, on the existing close-the-day action, about
   tomorrow. Stored on the day it is made; scored against the next day.
   NOT a new daily input surface: skipping it costs nothing and the whole
   feature hides when its column is absent. */
function predictionOf(k){                     /* the prediction MADE on day k, about k+1 */
  var p=S.privAll[k];
  if(!p) return null;
  var v=p.predict;
  return (v===true||v==='true'||v===1) ? true : (v===false||v==='false'||v===0) ? false : null;
}
function predictionRecord(n){
  var end=today(), made=0, kept=0;
  for(var i=1;i<=(n||30);i++){
    var day=shift(end,-i+1), prior=shift(day,-1);
    if(day>today()) continue;
    var pr=predictionOf(prior);
    if(pr===null) continue;
    if(!loggedOn(day)) { made++; continue; }   /* predicted and did not log = not kept */
    made++;
    var r=S.byDate[day];
    var hit=(r&&r.pct!=null&&r.pct>=80);
    if(pr===hit) kept++;
  }
  return { made:made, kept:kept, pct: made? Math.round(kept/made*100) : null };
}
async function savePredict(v){
  if(!S.hasPredict) return;
  var p=S.priv || (S.priv={});
  p.date=S.date; p.predict=v; S.privAll[S.date]=p;
  var res=await sb.from('day_private').upsert({
    user_id:S.me.id, date:S.date,
    rating:(p.rating==null?null:p.rating), why:p.why||'', tasks:p.tasks||'', prayer:p.prayer||'',
    predict:v
  },{ onConflict:'user_id,date' });
  toast(res.error ? 'prediction not saved' : (v?'called it — yes':'called it — no'));
  paintPredict();
}
function paintPredict(){
  var n=el('predict'); if(!n) return;
  if(!S.hasPredict){ n.style.display='none'; n.innerHTML=''; return; }
  n.style.display='';
  var made=predictionOf(today()), rec=predictionRecord(30);
  n.innerHTML='<div class="pr"><span class="k">Tomorrow</span>'+
    '<div class="s">Will you hit your standards tomorrow? Calling it out loud is worth more than '+
    'recording today was — say it and the ledger checks.</div>'+
    '<div class="tools" style="padding-top:8px">'+
      '<button class="btn'+(made===true?' pri':'')+'" id="prY">Yes</button>'+
      '<button class="btn'+(made===false?' pri':'')+'" id="prN">No</button>'+
      '<span style="flex:1"></span>'+
      '<span class="s">'+(rec.made? ('called right '+rec.kept+' of '+rec.made) : 'no calls yet')+'</span>'+
    '</div></div>';
  var y=el('prY'), no=el('prN');
  if(y)  y.onclick=function(){ savePredict(true); };
  if(no) no.onclick=function(){ savePredict(false); };
}

/* ---- R-D · GAIN FRAMING --------------------------------------------
   Evidence: identical stakes, gain framing vs loss framing — 17.40 vs 11.29
   goal-days out of 20 (p=.007). The sheet used to lead with what was LEFT
   and what was OUTSTANDING. It now leads with what was EARNED. Same
   arithmetic; the subtraction is simply never the headline. */
function earned(k){ return committed() - remaining(k); }

/* ============================ boot ============================ */
(async function boot(){
  var s='carbon'; try{ s=localStorage.getItem('st.skin')||'carbon'; }catch(e){}   /* HT-9a R70.21b: dark is the default; the layer overrides a stored light preference */
  skin(s);
  if(!(await load())) return;
  wire(); paintAll();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(function(r){ r.update(); }).catch(function(){});
  }
})();



/* ======================= HT-9a · THE SIMPLE VIEW LAYER (R70.41) =======================
   One block. It hides, reorders and labels; it computes nothing the app does not already compute, and
   it deletes nothing. `advanced()` true -> every function here returns immediately.

   Why a layer and not 26 guards inside the paints: the paints are what the HT-6 suite verifies. Editing
   them puts the hidden instruments at risk to make them invisible, which is backwards. R70.16 says
   hidden is not deleted; the cheapest way to honour that is to leave the code alone and change what the
   page shows. */
(function(){
  var GRP_ORDER = ['MORNING','AFTERNOON','NIGHT','STANDARDS','WEEKLY','OTHER'];
  var KEEP_HEADINGS = ['COMPLETION','RATE THE DAY','JOURNAL'];

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  /* ---- 1 · the dark lock, through the app's own skin() so Advanced still shows it selected ---- */
  function lockSkin(){
    if(advanced()) return;
    try{ if(localStorage.getItem('st.skin')!=='carbon') skin('carbon'); }catch(e){ skin('carbon'); }
    if(document.documentElement.getAttribute('data-skin')!=='carbon') skin('carbon');
  }

  /* ---- 2 · structure: outputs out, inputs in order, CLOSE THE DAY last ---- */
  function restructure(){
    if(advanced() || document.documentElement.hasAttribute('data-ht9a')) return;
    var colR = document.querySelector('.colR'); if(colR) colR.classList.add('ht9a-off');

    var jIn = document.getElementById('jIn'); if(!jIn) return;
    /* inside the input column, anything that is not one of the three input blocks is output */
    q('.blk', jIn).forEach(function(b){
      var h = b.querySelector('.sh h2');
      var t = h ? h.textContent.replace(/\s+/g,' ').trim().toUpperCase() : '';
      var keep = KEEP_HEADINGS.some(function(k){ return t.indexOf(k) >= 0; });
      if(!keep) b.classList.add('ht9a-off');
    });

    /* BRAIN DUMP — the fifth field. No column exists yet (the migration is HT-9b), so it persists
       per device and per date and the receipt says so. Nothing silently pretends to be saved. */
    var pray = document.getElementById('iPrayer');
    if(pray && !document.getElementById('iDump')){
      var host = pray.closest('.pan') || pray.closest('.blk') || pray.parentNode.parentNode;
      var lab = document.createElement('label');
      lab.className = 'fld';
      lab.innerHTML = '<span class="lab">Brain dump</span>' +
                      '<textarea id="iDump" rows="3" placeholder="Everything in your head, out."></textarea>';
      host.insertBefore(lab, host.firstChild);
      var ta = lab.querySelector('#iDump'), t = null;
      ta.addEventListener('input', function(){
        clearTimeout(t);
        t = setTimeout(function(){ try{ localStorage.setItem('ht_dump_'+S.date, ta.value); }catch(e){} }, 500);
      });
    }
    /* COMPLETED — the existing `tasks` field, relabelled. The column does not move. */
    var tasks = document.getElementById('iTasks');
    if(tasks){
      var tl = tasks.closest('.fld') && tasks.closest('.fld').querySelector('.lab');
      if(tl) tl.textContent = 'Completed';
    }
    var pl = pray && pray.closest('.fld') && pray.closest('.fld').querySelector('.lab');
    if(pl) pl.textContent = 'Prayer';

    /* CLOSE THE DAY -> last child of the input column, sticky */
    var bClose = document.getElementById('bClose');
    if(bClose){
      var wrap = document.getElementById('tClose');
      if(!wrap){ wrap = document.createElement('div'); wrap.id = 'tClose'; }
      wrap.appendChild(bClose);
      jIn.appendChild(wrap);
    }
    document.documentElement.setAttribute('data-ht9a','1');
  }

  /* ---- 3 · header: HT · weekday date · done of total · < > · SETTINGS ---- */
  function header(){
    if(advanced()) return;
    var r1 = document.querySelector('.mast .r1'); if(!r1) return;
    var set = document.getElementById('bSet');
    if(!document.getElementById('hCount')){
      var c = document.createElement('span'); c.id='hCount'; c.className='sub num';
      r1.insertBefore(c, set);
      var p = document.createElement('button'); p.id='hPrev'; p.className='tbtn';
      p.title='previous day'; p.textContent='\u2039';
      var n = document.createElement('button'); n.id='hNext'; n.className='tbtn';
      n.title='next day'; n.textContent='\u203a';
      r1.insertBefore(p, set); r1.insertBefore(n, set);
      p.onclick = function(){ goDay(shift(S.date,-1)); };
      n.onclick = function(){ goDay(shift(S.date, 1)); };
    }
    try{
      var ck = ckOf(S.date), dl = daily(), wk = weekly();
      var done = dl.filter(function(h){ return ck[h.id]; }).length +
                 wk.filter(function(h){ return weekDone(h.id, S.date); }).length;
      document.getElementById('hCount').textContent = done + ' of ' + (dl.length + wk.length);
    }catch(e){}
  }

  /* ---- 4 · group the rows under headers, in the fixed order ---- */
  function group(){
    if(advanced()) return;
    var log = document.getElementById('log'); if(!log) return;
    var rows = q('.li', log); if(!rows.length) return;
    var buckets = {};
    rows.forEach(function(r){
      /* the group comes from habits.group_name, never from the row's .gp span: paintLog only emits
         .gp in the full sheet, so reading the DOM put every standard in OTHER. MEASURED. */
      var hid = r.getAttribute('data-h');
      var h = S.habits.filter(function(x){ return x.id === hid; })[0];
      var name = ((h && h.group_name) || 'Other').replace(/\s+/g,' ').trim().toUpperCase();
      (buckets[name] = buckets[name] || []).push(r);
    });
    var order = GRP_ORDER.filter(function(g){ return buckets[g]; })
      .concat(Object.keys(buckets).filter(function(g){ return GRP_ORDER.indexOf(g) < 0; }).sort());
    var frag = document.createDocumentFragment();
    order.forEach(function(g){
      var h = document.createElement('div'); h.className = 'grp'; h.textContent = g;
      frag.appendChild(h);
      buckets[g].forEach(function(r){ frag.appendChild(r); });
    });
    log.innerHTML = '';
    log.appendChild(frag);
  }

  /* ---- 5 · the Advanced toggle, inside Settings ---- */
  function advToggle(){
    var ov = document.querySelector('.ov.on .inner') || document.querySelector('.ov .inner');
    if(!ov || document.getElementById('advWrap')) return;
    var w = document.createElement('div'); w.id='advWrap'; w.className='pan';
    w.style.marginTop='14px';
    var on = advanced();
    w.innerHTML = '<div class="lab">Advanced</div>' +
      '<div class="note" style="margin:6px 0 9px">Everything the simple view hides — the instruments, ' +
      'the statistics, the other themes and the sheet controls. Nothing was deleted; this shows it again.</div>' +
      '<button class="btn" id="advBtn">' + (on ? 'Advanced is ON — turn it off' : 'Turn Advanced ON') + '</button>';
    ov.appendChild(w);
    document.getElementById('advBtn').onclick = function(){
      try{ localStorage.setItem('ht_advanced', on ? '0' : '1'); }catch(e){}
      location.reload();
    };
  }

  /* ---- 6 · re-apply after the app repaints. The app calls these by name, so reassigning the
              binding in this shared scope is enough; no observer, no polling. ---- */
  function simplify(){ restructure(); group(); header(); }

  var _log = paintLog;   paintLog  = function(){ _log.apply(null, arguments);  group(); header(); };
  var _mast = paintMast; paintMast = function(){ _mast.apply(null, arguments);
                                                  restructure(); header(); loadDump(); };
  var _go = goDay;       goDay     = function(k){ _go.call(null, k); simplify(); loadDump(); };
  var _os = openSettings; openSettings = function(){ _os.apply(null, arguments); setTimeout(advToggle, 60); };

  function loadDump(){
    var ta = document.getElementById('iDump'); if(!ta) return;
    try{ ta.value = localStorage.getItem('ht_dump_' + S.date) || ''; }catch(e){}
  }

  function boot(){ lockSkin(); simplify(); loadDump(); }
  if(document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', function(){ setTimeout(boot, 0); });
})();



/* ======================= HT-10 · JOURNAL LAYER (PASTE 32 §A) =======================
   One section, four fields, every day editable. Appended to the HT-9a layer's scope, inside the same
   sealed closure, so it can call savePriv/queuePriv/paintJournalInputs directly. */
(function(){
  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function grow(t){ if(!t) return; t.style.height='auto'; t.style.height=(t.scrollHeight+2)+'px'; }

  /* ---- 1 · one section: rating moves in above the three journals, "why" leaves ---- */
  function journalise(){
    if(advanced() || document.documentElement.hasAttribute('data-ht10')) return;
    var dump = document.getElementById('iDump'); if(!dump) return;      /* 9a layer not up yet */
    var host = dump.closest('.pan') || dump.parentNode.parentNode;
    var rate = document.getElementById('rate');
    if(rate && !document.getElementById('rateWrap')){
      var w = document.createElement('div'); w.id = 'rateWrap';
      var lab = document.createElement('span'); lab.className = 'lab';
      lab.textContent = 'Rate the day'; lab.style.display = 'block'; lab.style.marginBottom = '6px';
      w.appendChild(lab); w.appendChild(rate);
      host.insertBefore(w, host.firstChild);
      var rblk = document.querySelector('.blk .rate') ? null : null;
    }
    var why = document.getElementById('iWhy');
    if(why){ var f = why.closest('.fld'); if(f) f.id = 'whyFld'; }
    /* the emptied "Rate the day" block, and the journal head, renamed */
    var blks = Array.prototype.slice.call(document.querySelectorAll('#jIn .blk'));
    blks.forEach(function(b){
      var h = b.querySelector('.sh h2');
      var t = h ? h.textContent.toUpperCase() : '';
      if(t.indexOf('RATE THE DAY') >= 0 && !b.querySelector('#rate')) b.classList.add('ht9a-off');
      if(t.indexOf('JOURNAL') >= 0 && h) h.textContent = 'Journal';
    });
    var pray = document.getElementById('iPrayer');
    if(pray) pray.setAttribute('placeholder', '\u2026');
    document.documentElement.setAttribute('data-ht10','1');
  }

  /* ---- 2 · the fifth field is a real column now ---- */
  function bindDump(){
    var t = document.getElementById('iDump'); if(!t || t.dataset.bound) return;
    t.dataset.bound = '1';
    t.addEventListener('input', function(){
      S.priv = S.priv || {}; S.priv.brain_dump = t.value; grow(t); queuePriv();
    });
    ['iDump','iTasks','iPrayer','iWhy'].forEach(function(id){
      var n = document.getElementById(id); if(!n || n.dataset.blurred) return;
      n.dataset.blurred = '1';
      n.addEventListener('blur', function(){ savePriv(); });     /* A2: upsert on blur, not only debounced */
    });
    var c = document.getElementById('bClose');
    if(c && !c.dataset.flush){ c.dataset.flush = '1';
      c.addEventListener('click', function(){ savePriv(); }, true); }   /* A2: and on CLOSE THE DAY */
  }

  /* ---- 3 · every day populates, including the new field ---- */
  var _pji = paintJournalInputs;
  paintJournalInputs = function(){
    _pji.apply(null, arguments);
    var t = document.getElementById('iDump');
    if(t){ t.value = (S.priv && S.priv.brain_dump) || ''; grow(t); }
    grow(document.getElementById('iTasks')); grow(document.getElementById('iPrayer'));
    journalise(); bindDump();
  };

  /* ---- 4 · import the 9a stopgap, once, then clear it ----
     9a persisted the brain dump per device in localStorage because the column did not exist. Those
     entries are Cory's writing and they are NOT dropped: they move into day_private the first time
     this build runs with the column present, and only where the column is empty. */
  async function importStopgap(){
    if(!S.hasDump) return;
    var keys = [];
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i);
           if(k && k.indexOf('ht_dump_')===0) keys.push(k); } }catch(e){ return; }
    var moved = 0;
    for(var j=0;j<keys.length;j++){
      var date = keys[j].slice(8), val = '';
      try{ val = localStorage.getItem(keys[j]) || ''; }catch(e){}
      if(!val.trim()){ try{ localStorage.removeItem(keys[j]); }catch(e){} continue; }
      var row = S.privAll[date];
      if(row && (row.brain_dump||'').trim()){ try{ localStorage.removeItem(keys[j]); }catch(e){} continue; }
      var res = await sb.from('day_private').upsert(
        { user_id:S.me.id, date:date, brain_dump:val }, { onConflict:'user_id,date' });
      if(!res.error){
        S.privAll[date] = S.privAll[date] || { date:date };
        S.privAll[date].brain_dump = val;
        try{ localStorage.removeItem(keys[j]); }catch(e){}
        moved++;
      }
    }
    if(moved) { toast(moved + ' brain dump' + (moved>1?'s':'') + ' moved to the database');
                if(S.privAll[S.date]) S.priv = S.privAll[S.date];
                paintJournalInputs(); }
  }

  function boot(){ journalise(); bindDump(); importStopgap(); }
  if(document.readyState === 'complete') setTimeout(boot, 120);
  else window.addEventListener('load', function(){ setTimeout(boot, 120); });
})();

/* ======================= HT-11 · TASKS LAYER (PASTE 35 §2 · PASTE 32 §B 8–13) =======================
   Edit a standard from the front screen, drag it into order, add one at the foot of its group, and
   leave the back-end table editor intact behind Settings -> Advanced.

   A LAYER, for the same reason 9a and 10 are layers: `paintLog` is what the HT-6 golden suite verifies,
   and the 9a layer already re-parents its rows under `.grp` headers. Editing the paint to add an edit
   affordance would put 17 passing assertions at risk to gain a pencil. So this block decorates what 9a
   has already produced, and computes nothing the app does not already compute.

   THE THREE NEW COLUMNS ARE OPTIONAL BY CONSTRUCTION. `planned_start`, `planned_end` and `notes` are
   4-HT's to run in Cory's Supabase editor; until they land the sheet probes, finds them absent, and
   hides those rows — the same degrade-cleanly contract `habits.cue` and `day_private.predict` already
   have. Nothing on this sheet pretends to save.

   R47.3 STRICT: every read and every write below is user_id-scoped. `golden_ht11.py` records every
   query the sheet issues and FAILS if any `habits` statement lacks a user_id filter. */
(function(){
  var GROUPS = ['Morning','Afternoon','Night','Standards','Weekly','Other'];
  var LONG_PRESS = 450;     /* B2: the phone gesture, in ms */
  var DRAG_SLOP  = 6;       /* px of movement that turns a press into a drag, never a tap */

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function hby(id){ return S.habits.filter(function(x){ return x.id===id; })[0] || null; }
  function groupsFor(sel){
    var out=GROUPS.slice();
    S.habits.forEach(function(h){ var g=h.group_name; if(g && out.indexOf(g)<0) out.push(g); });
    if(sel && out.indexOf(sel)<0) out.push(sel);
    return out;
  }
  /* the 9a layer prints group headers UPPERCASE; this maps one back to the STORED value.
     null means "this header matches no group I know" -> the drag leaves that row's group alone. */
  function canonGroup(txt){
    var t=String(txt||'').replace(/\s+/g,' ').trim();
    var hit=GROUPS.filter(function(g){ return g.toUpperCase()===t.toUpperCase(); })[0];
    if(hit) return hit;
    return S.habits.map(function(h){ return h.group_name; })
      .filter(function(g){ return g && g.toUpperCase()===t.toUpperCase(); })[0] || null;
  }

  /* ---- 1 · probe for the three columns, once, scoped to the signed-in user ----
     Two probes, not one: the window pair and `notes` can land separately, and reporting "no columns"
     because one of three is missing would hide a field that exists. */
  var probed=false;
  async function probe(){
    if(probed || !S.me || !S.me.id) return;
    probed=true;
    var w = await sb.from('habits').select('id,planned_start,planned_end')
              .eq('user_id',S.me.id).eq('active',true).order('sort_order');
    S.hasWindow = !w.error;
    var n = await sb.from('habits').select('id,notes')
              .eq('user_id',S.me.id).eq('active',true).order('sort_order');
    S.hasNotes = !n.error;
    /* HT-16 S6 (R70.103): a third probe. `time_anchor` and `minutes_planned` land together but a
       probe that asks for both and gets one is still a probe that reports "no columns", so they get
       their own. Absent -> the two fields are hidden and TODAY keeps its existing order. */
    var t = await sb.from('habits').select('id,time_anchor,minutes_planned')
              .eq('user_id',S.me.id).eq('active',true).order('sort_order');
    S.hasTime = !t.error;
    /* merge what exists onto the rows load() already has — HCOLS is fixed and golden-verified */
    if(S.hasWindow) (w.data||[]).forEach(function(r){
      var h=hby(r.id); if(h){ h.planned_start=r.planned_start; h.planned_end=r.planned_end; } });
    if(S.hasNotes) (n.data||[]).forEach(function(r){
      var h=hby(r.id); if(h){ h.notes=r.notes; } });
    if(S.hasTime) (t.data||[]).forEach(function(r){
      var h=hby(r.id); if(h){ h.time_anchor=r.time_anchor; h.minutes_planned=r.minutes_planned; } });
  }

  /* ---- 2 · THE EDIT SHEET (B2) — over TODAY, not a page ----
     Its own element, never `#ov`: `#ov` is Settings/Guide/Circle, and opening the sheet must not tear
     one of those down. */
  function sheetEl(){
    var n=document.getElementById('esheet');
    if(n) return n;
    n=document.createElement('div'); n.id='esheet'; n.className='esheet';
    n.innerHTML='<div class="ebody" id="ebody"></div>';
    document.body.appendChild(n);
    n.addEventListener('click',function(e){
      if(e.target===n) closeSheet();                        /* the scrim */
      if(e.target.closest('[data-ex]')) closeSheet();
    });
    n.addEventListener('keydown',function(e){ if(e.key==='Escape') closeSheet(); });
    return n;
  }
  function closeSheet(){ var n=document.getElementById('esheet'); if(n) n.classList.remove('on'); }
  function fld(lab,inner){ return '<label class="fld"><span class="lab">'+lab+'</span>'+inner+'</label>'; }

  function openSheet(h, presetGroup){
    var isNew = !h;
    h = h || { name:'', group_name:presetGroup||'Standards', cadence:'daily', minutes:0,
               link:'', notes:'', planned_start:'', planned_end:'', cue:'' };
    var grp = h.group_name||'Other';
    var n=sheetEl();
    document.getElementById('ebody').innerHTML =
      '<div class="eh"><h3>'+(isNew?'New standard':'Edit standard')+'</h3>'+
        '<span style="flex:1"></span><button class="tbtn" data-ex="1">Close</button></div>'+
      fld('Name','<input id="eName" value="'+esc(h.name)+'" placeholder="standard" autocomplete="off">')+
      fld('Group','<select id="eGroup">'+groupsFor(grp).map(function(g){
          return '<option'+(g===grp?' selected':'')+'>'+esc(g)+'</option>'; }).join('')+'</select>')+
      fld('Cadence','<select id="eCad">'+
          '<option value="daily"'+(h.cadence!=='weekly'?' selected':'')+'>Daily</option>'+
          '<option value="weekly"'+(h.cadence==='weekly'?' selected':'')+'>Weekly</option></select>')+
      (S.hasWindow ? '<div class="fld" id="eWinFld"><span class="lab">Planned window</span>'+
          '<div class="win"><input id="eStart" type="time" value="'+esc(h.planned_start||'')+'">'+
          '<span class="dash">–</span>'+
          '<input id="eEnd" type="time" value="'+esc(h.planned_end||'')+'"></div></div>' : '')+
      fld('Planned minutes','<input id="eMin" class="num" type="number" min="0" step="5" value="'+
          (h.minutes||0)+'">')+
      /* HT-16 S6 · R70.103 — when in the day, and how long. Both optional, both degrade with the
         column. The suggestion under the anchor is the MEDIAN close time of this standard's last 30
         check-offs; one tap adopts it, and it is never written without the tap. */
      (S.hasTime ? '<div class="fld" id="eTimeFld"><span class="lab">Time anchor \u00b7 optional</span>'+
          '<div class="win"><input id="eAnchor" type="time" value="'+esc(hhmm(h.time_anchor)||'')+'">'+
          '<input id="ePlan" class="num" type="number" min="0" step="5" placeholder="minutes" value="'+
          (h.minutes_planned==null?'':h.minutes_planned)+'"></div>'+
          (function(){
             if(h.time_anchor || !h.id) return '';
             var m = (window.__HT16 && window.__HT16.medianClose) ? window.__HT16.medianClose(h.id) : null;
             return m? '<button class="btn h16adopt" id="eAdopt" data-t="'+m+'">usually done ~'+m+
                       '</button>' : '';
           })()+
          '</div>' : '')+
      fld('Link','<input id="eLink" value="'+esc(h.link||'')+'" placeholder="https://…" '+
          'inputmode="url" autocomplete="off">')+
      (S.hasNotes ? fld('Notes','<textarea id="eNotes" rows="3" placeholder="…">'+
          esc(h.notes||'')+'</textarea>') : '')+
      (S.hasCue ? fld('Cue','<input id="eCue" value="'+esc(h.cue||'')+'" '+
          'placeholder="after I ___, I will ___">') : '')+
      '<div class="etools">'+
        (isNew?'':'<button class="btn" id="eArch">Archive</button>')+
        '<span style="flex:1"></span>'+
        '<button class="btn" id="eCancel">Cancel</button>'+
        '<button class="btn pri" id="eSave">Save</button>'+
      '</div>'+
      (S.hasTime ? '' :
        '<div class="note enote">A time anchor and its planned minutes need one migration before '+
        'they can be saved. Everything else on this sheet saves now.</div>')+
      (S.hasWindow&&S.hasNotes ? '' :
        '<div class="note enote">'+
        (!S.hasWindow&&!S.hasNotes ? 'Planned window and notes need one migration before they can be saved.'
         : !S.hasWindow ? 'The planned window needs one migration before it can be saved.'
         : 'Notes need one migration before they can be saved.')+
        ' Everything else on this sheet saves now.</div>');

    n.classList.add('on');
    if(isNew) setTimeout(function(){ var f=document.getElementById('eName'); if(f) f.focus(); },60);
    document.getElementById('eCancel').onclick=closeSheet;
    document.getElementById('eSave').onclick=function(){ saveSheet(h,isNew); };
    var ar=document.getElementById('eArch');
    if(ar) ar.onclick=function(){ archiveOne(h); };
    var ad=document.getElementById('eAdopt');
    if(ad) ad.onclick=function(e){ e.preventDefault();
      var f=document.getElementById('eAnchor');
      if(f) f.value=ad.getAttribute('data-t');
      ad.parentNode.removeChild(ad); };
  }

  function num(id){ var n=document.getElementById(id); return n?(+n.value||0):0; }
  function str(id){ var n=document.getElementById(id); return n?String(n.value||'').trim():''; }

  async function saveSheet(h,isNew){
    var name=str('eName');
    if(!name){ toast('a standard needs a name'); return; }
    var rec={ user_id:S.me.id, name:name, group_name:str('eGroup'),
              cadence:str('eCad')==='weekly'?'weekly':'daily',
              minutes:num('eMin'), link:str('eLink')||null };
    if(S.hasCue)    rec.cue = str('eCue');
    if(S.hasWindow){ rec.planned_start = str('eStart')||null; rec.planned_end = str('eEnd')||null; }
    if(S.hasNotes)   rec.notes = str('eNotes')||null;
    if(S.hasTime){ rec.time_anchor = str('eAnchor')||null;
                   var mp=document.getElementById('ePlan');
                   rec.minutes_planned = (mp && String(mp.value||'').trim()!=='') ? (+mp.value||0) : null; }
    var res;
    if(isNew){
      /* a new row goes to the foot of its OWN group, not the foot of the list */
      var peers=S.habits.filter(function(x){ return (x.group_name||'Other')===rec.group_name; });
      rec.sort_order = peers.length
        ? Math.max.apply(null,peers.map(function(x){ return x.sort_order||0; }))+1
        : S.habits.length;
      res = await sb.from('habits').insert(rec);
    } else {
      res = await sb.from('habits').update(rec).eq('id',h.id).eq('user_id',S.me.id);
    }
    if(res && res.error){ toast('not saved — '+String(res.error.message||'').slice(0,60)); return; }
    closeSheet(); toast(isNew?'standard added':'standard saved');
    await reload();
  }

  /* archive is `active=false` + `archived_at` — DEC-037: it leaves TODAY, it stays in every past day */
  async function archiveOne(h){
    if(!confirm('Archive "'+label(h.name)+'"? It leaves TODAY and stays in every past day and export.')) return;
    var res = await sb.from('habits')
      .update({ active:false, archived_at:new Date().toISOString() })
      .eq('id',h.id).eq('user_id',S.me.id);
    if(res && res.error){ toast('not archived — '+String(res.error.message||'').slice(0,60)); return; }
    closeSheet(); toast('archived');
    await reload();
  }
  async function reload(){ probed=false; await load(); await probe(); paintAll(); }

  /* ---- 3 · the affordances: a pencil on hover (desktop), a long press (phone) ---- */
  function decorate(){
    var log=document.getElementById('log'); if(!log) return;
    q('.li',log).forEach(function(r){
      if(r.querySelector('.edp')) return;
      var p=document.createElement('span');
      p.className='edp'; p.setAttribute('role','button');
      p.setAttribute('tabindex','0');           /* HT-16 R70.98: checkbox -> link -> edit */
      p.title='edit this standard'; p.textContent='✎';
      r.appendChild(p);
    });
    addFooters();
  }

  /* ---- 4 · "+ Add standard" at the foot of each group, pre-filled with that group (B4) ---- */
  function addFooters(){
    var log=document.getElementById('log'); if(!log) return;
    q('.eadd',log).forEach(function(n){ n.parentNode.removeChild(n); });
    var kids=Array.prototype.slice.call(log.children);
    var heads=kids.filter(function(k){ return k.classList.contains('grp'); });
    if(!heads.length){
      /* advanced / full sheet: no group headers, so one button at the foot of the list */
      if(kids.filter(function(k){ return k.classList.contains('li'); }).length) log.appendChild(mkAdd(null));
      return;
    }
    var cur=null;
    kids.forEach(function(k){
      if(!k.classList.contains('grp')) return;
      if(cur!==null) log.insertBefore(mkAdd(cur),k);
      cur=canonGroup(k.textContent) || String(k.textContent||'').trim();
    });
    if(cur!==null) log.appendChild(mkAdd(cur));
  }
  function mkAdd(group){
    var b=document.createElement('button');
    b.className='eadd'; b.type='button';
    b.setAttribute('data-add', group==null?'':group);
    b.textContent='+ Add standard'+(group?' to '+String(group).toLowerCase():'');
    return b;
  }

  /* ---- 5 · DRAG TO REORDER (B3) — within and across groups, persisted in sort_order ----
     One pointer handler for both surfaces. Desktop: a drag begins as soon as the pointer passes the
     slop. Touch: nothing happens until the 450 ms press has ARMED the row, so the page still scrolls
     normally — then a move drags, and a lift with no move opens the sheet. Crossing a group header
     is how a row changes group; that is the same gesture, and it is deliberate. */
  var st=null;                                    /* the live gesture, or null */
  var suppressClick=false;

  function midOf(n){ var r=n.getBoundingClientRect(); return r.top + r.height/2; }

  function beginDrag(){
    st.dragging=true;
    st.row.classList.add('dragging');
    var log=document.getElementById('log'); if(log) log.classList.add('reordering');
    try{ st.row.setPointerCapture(st.pid); }catch(e){}
  }

  function moveDrag(y){
    var log=document.getElementById('log'); if(!log) return;
    var others=q('.li',log).filter(function(n){ return n!==st.row; });
    var before=null;
    for(var i=0;i<others.length;i++){ if(y < midOf(others[i])){ before=others[i]; break; } }
    if(before){
      /* a row lands ABOVE a group header only when the pointer is genuinely above it */
      var prev=before.previousElementSibling;
      if(prev && prev.classList && prev.classList.contains('grp') && y > midOf(prev)) before=prev.nextSibling;
      if(before!==st.row && before!==st.row.nextSibling) log.insertBefore(st.row,before);
    } else {
      var last=others[others.length-1];
      if(last && last!==st.row){
        var after=last.nextSibling;
        while(after && after.classList && after.classList.contains('eadd')) after=after.nextSibling;
        if(after!==st.row) log.insertBefore(st.row,after);
      }
    }
  }

  /* the row is passed in: `st` is already cleared by the time the drop is committed */
  async function endDrag(row){
    var log=document.getElementById('log');
    if(row) row.classList.remove('dragging');
    if(log) log.classList.remove('reordering');
    if(!log) return;
    var order=0, cur=null, ops=[], moved=0;
    Array.prototype.slice.call(log.children).forEach(function(k){
      if(k.classList.contains('grp')){ cur=canonGroup(k.textContent); return; }
      if(!k.classList.contains('li')) return;
      var hid=k.getAttribute('data-h'), h=hby(hid); if(!h) return;
      var so=order++;
      var grp=(cur==null)?null:cur;
      var chg={};
      if(h.sort_order!==so) chg.sort_order=so;
      if(grp!==null && (h.group_name||'')!==grp) chg.group_name=grp;
      if(!Object.keys(chg).length) return;
      h.sort_order=so; if(chg.group_name!==undefined) h.group_name=grp;
      moved++;
      ops.push(sb.from('habits').update(chg).eq('id',hid).eq('user_id',S.me.id));
    });
    if(!moved){ paintLog(); return; }
    var res = await Promise.all(ops);
    var bad = res.filter(function(r){ return r && r.error; });
    toast(bad.length ? (bad.length+' row'+(bad.length>1?'s':'')+' did not save')
                     : ('order saved · '+moved+' row'+(moved>1?'s':'')));
    paintLog();
  }

  function cancelPress(){ if(st && st.timer){ clearTimeout(st.timer); st.timer=null; } }

  function onDown(e){
    if(e.button!=null && e.button!==0) return;
    if(e.target.closest('.eadd')) return;
    if(e.target.closest('.edp')) return;                      /* the pencil is a click, not a drag */
    var row=e.target.closest('.li'); if(!row) return;
    var touch=(e.pointerType==='touch'||e.pointerType==='pen');
    st={ row:row, hid:row.getAttribute('data-h'), x:e.clientX, y:e.clientY, pid:e.pointerId,
         touch:touch, armed:!touch, dragging:false, timer:null };
    if(touch) st.timer=setTimeout(function(){
      if(!st) return;
      st.armed=true; st.row.classList.add('armed');
      try{ if(navigator.vibrate) navigator.vibrate(12); }catch(err){}
    },LONG_PRESS);
  }
  function onMove(e){
    if(!st) return;
    var d=Math.abs(e.clientY-st.y)+Math.abs(e.clientX-st.x);
    if(!st.armed){ if(d>10) cancelPress(); return; }           /* a scroll, not a press */
    if(!st.dragging){ if(d<=DRAG_SLOP) return; beginDrag(); }
    e.preventDefault();
    moveDrag(e.clientY);
  }
  function onUp(){
    if(!st) return;
    cancelPress();
    var s=st; st=null;
    s.row.classList.remove('armed');
    if(s.dragging){ suppressClick=true; endDrag(s.row); return; }
    if(s.touch && s.armed){                                    /* long press, no move: the sheet */
      suppressClick=true;
      var h=hby(s.hid); if(h) openSheet(h);
      return;
    }
    /* desktop press with no movement: leave it — the app's own click toggles the row */
  }

  function bind(){
    var log=document.getElementById('log'); if(!log || log.dataset.ht11) return;
    log.dataset.ht11='1';
    /* CAPTURE, so this runs BEFORE the app's own bubble listener on #log: the pencil, the add button
       and the tail of a drag must never reach toggle(). */
    log.addEventListener('click',function(e){
      var add=e.target.closest('.eadd');
      if(add){ e.stopPropagation(); e.preventDefault();
               var g=add.getAttribute('data-add'); openSheet(null,g||undefined); return; }
      if(e.target.closest('.edp')){ e.stopPropagation(); e.preventDefault();
               var r=e.target.closest('.li'), h=r&&hby(r.getAttribute('data-h'));
               if(h) openSheet(h); return; }
      if(suppressClick){ suppressClick=false; e.stopPropagation(); e.preventDefault(); }
    },true);
    log.addEventListener('pointerdown',onDown);
    window.addEventListener('pointermove',onMove,{passive:false});
    window.addEventListener('pointerup',onUp);
    window.addEventListener('pointercancel',function(){
      cancelPress();
      if(st&&st.row){ st.row.classList.remove('armed'); st.row.classList.remove('dragging'); }
      var log2=document.getElementById('log'); if(log2) log2.classList.remove('reordering');
      st=null;
    });
  }

  /* ---- 6 · the back-end editor moves behind Settings -> Advanced (B5 · R70.16) ----
     Hidden, never deleted: the nodes are collected into one wrapper and that wrapper carries the class
     the 9a stylesheet already hides in simple mode. Turn Advanced on and the whole table is back. */
  function tuckEditor(){
    var list=document.getElementById('edList'); if(!list) return;
    if(document.getElementById('beEditor')) return;
    var back=[], p=list.previousElementSibling;
    while(p){ back.unshift(p); if(p.classList.contains('sh')) break; p=p.previousElementSibling; }
    var nodes=back.concat([list]);
    var fwd=list.nextElementSibling;
    if(fwd && fwd.classList.contains('tools')) nodes.push(fwd);
    var host=nodes[0].parentNode;
    var wrap=document.createElement('div'); wrap.id='beEditor';
    host.insertBefore(wrap,nodes[0]);
    nodes.forEach(function(x){ wrap.appendChild(x); });
    if(!advanced()){
      wrap.classList.add('ht9a-off');
      var note=document.createElement('div');
      note.className='note'; note.id='beNote'; note.style.padding='14px 0 0';
      note.textContent='Standards are edited from the front screen now — press and hold a row on the '+
        'phone, or use the pencil on the desktop. The full table editor is still here, under Advanced.';
      host.insertBefore(note,wrap);
    }
  }

  /* ---- 7 · re-apply after every repaint, the way 9a and 10 do ---- */
  var _log=paintLog;
  paintLog=function(){ _log.apply(null,arguments); decorate(); bind(); };
  var _os=openSettings;
  openSettings=function(){ _os.apply(null,arguments); setTimeout(tuckEditor,80); };

  async function boot(){
    await probe();
    decorate(); bind();
    if(S.hasWindow||S.hasNotes) paintLog();      /* the merged columns are on the rows now */
  }
  if(document.readyState==='complete') setTimeout(boot,160);
  else window.addEventListener('load',function(){ setTimeout(boot,160); });
})();

/* ======================= HT-13 · VIEWS LAYER (PASTE 35 §2 · PASTE 32 §D 15–17) =======================
   The first wire since 9a that renders OUTPUT. Six views: the life graph, two month grids, trends,
   group adherence, three insights.

   WHY A NEW SURFACE AND NOT `.colR`. The old right column is hidden wholesale in simple mode and it
   holds every legacy instrument id — `life`, `cal`, `chart`, `dow`, `byMo`, `heat`, twenty more. Making
   it visible would render all of them and break the one invariant 9a bought: no hidden id in the visible
   tree. So `#vViews` is built OUTSIDE `.colR`, `.colR` stays hidden, and the allow-list gains exactly
   the six `#v…` ids this wire names and nothing else (R70.16 · smoke check 2).

   R70.17 — no output above an input. TODAY keeps the left column and stays the landing screen. Below
   1024px VIEWS is a SECOND TAB, so output never sits above the inputs; at 1024px and up it is the right
   column, beside them, never over them.

   Everything here reads S and recomputes from it. No new query, no new column beyond B1's `target_age`,
   and every number is derived from the same selectors TODAY already uses. */
(function(){
  var GRP_ORDER=['Morning','Afternoon','Night','Standards','Weekly','Other'];
  var DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var DOWFULL=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var LIFE_ESSAY='https://waitbutwhy.com/2014/05/life-weeks.html';
  var DEFAULT_TARGET=90;   /* HT-15 R70.68 raised this from 80; one default in the app, not two */

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function targetAge(){
    var t=S.priv0&&S.priv0.target_age;
    return (t==null||t==='')?DEFAULT_TARGET:+t;
  }
  function birth(){ var b=S.priv0&&S.priv0.birth_date; return b?new Date(b+'T12:00:00'):null; }
  /* completion colour: the app's own grade bands, so a day reads the same here as on the sheet */
  function gfill(p){ var g=grade(p); return g[1]==null?'var(--sunk)':'var(--g'+Math.max(1,g[1])+')'; }
  function pctOn(k){ var r=S.byDate[k]; return (r&&r.pct!=null&&loggedOn(k))?r.pct:null; }
  function loggedDates(){ return dates().filter(function(k){ return pctOn(k)!=null; }); }
  function meanOf(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }

  /* ---- the surface ------------------------------------------------------------------ */
  var VIEW_IDS=['vLife','vMonthC','vMonthR','vTrends','vGroups','vInsights'];
  function head(t,c,id){
    return '<div class="sh"><h2>'+t+'</h2><span class="ln"></span>'+
           '<span class="c"'+(id?' id="'+id+'"':'')+'>'+(c||'')+'</span></div>';
  }
  function build(){
    if(document.getElementById('vViews')) return document.getElementById('vViews');
    var grid=document.querySelector('.grid'); if(!grid) return null;
    var sec=document.createElement('section');
    sec.id='vViews'; sec.className='vViews';
    sec.innerHTML=
      head('The life','','vLifeC')+'<div class="pan flat" id="vLife"></div>'+
      '<div class="note vabout">The whole life, one cell at a time — after '+
        '<a href="'+LIFE_ESSAY+'" target="_blank" rel="noopener">Your Life in Weeks</a>.</div>'+
      head('Month · completion','','vMonthCC')+
      '<div class="vnav" id="vNav"></div><div class="cal" id="vMonthC"></div>'+
      head('Month · rating','same ramp, 1–10 scaled','vMonthRC')+'<div class="cal" id="vMonthR"></div>'+
      head('Trends','7-day rolling','vTrendsC')+
      '<div class="seg mini" id="vRange">'+
        '<button data-r="30" class="on">30</button><button data-r="90">90</button>'+
        '<button data-r="all">All</button></div>'+
      '<div class="pan flat"><svg id="vTrends" class="chart"></svg></div>'+
      head('Group adherence','','vGroupsC')+'<div class="cols" id="vGroups"></div>'+
      head('Insights','three','vInsightsC')+'<div id="vInsights"></div>';
    grid.appendChild(sec);
    return sec;
  }

  /* ---- B2 · THE LIFE GRAPH ----------------------------------------------------------
     Rows are years. Desktop one cell per DAY (365/row), phone one cell per WEEK (52/row), same data.
     Drawn as RUNS, not cells: a lived-but-unlogged stretch is one rect per row, and only logged days
     and today get their own. A per-day grid for 80 years is 29,200 nodes; this is ~80 plus one per
     logged day, and it renders identically. */
  function paintLife13(){
    var host=document.getElementById('vLife'); if(!host) return;
    var cap=document.getElementById('vLifeC');
    var b=birth(), tgt=targetAge();
    var perWeek = window.innerWidth < 1024;             /* phone: a cell is a week */
    var cols = perWeek ? 52 : 365;
    var logged=loggedDates();
    var mean=meanOf(logged.map(pctOn));

    if(!b){
      /* it does not guess. The logged days alone, and one sentence. */
      var n=logged.length;
      var W=Math.max(1,Math.min(n,cols)), Hh=Math.max(4,Math.ceil(n/W)*4);
      host.innerHTML='<svg class="lifeg" viewBox="0 0 '+(W*4)+' '+Hh+'" preserveAspectRatio="xMinYMin meet">'+
        logged.map(function(k,i){
          return '<rect x="'+(i%W*4)+'" y="'+(Math.floor(i/W)*4)+'" width="3" height="3" fill="'+
                 gfill(pctOn(k))+'"/>'; }).join('')+'</svg>'+
        '<div class="vempty">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent=n+' day'+(n===1?'':'s')+' logged';
      return;
    }

    var now=new Date();
    var dayNo=Math.floor((now-b)/864e5)+1;               /* day 1 is the day of birth */
    var totalDays=Math.round(tgt*365.2425);
    var left=Math.max(0,totalDays-dayNo);
    var rows=tgt;
    var CW=perWeek?7:2, CH=perWeek?7:2, GAP=1;
    var W=cols*(CW+GAP), H=rows*(CH+GAP);
    var lg={}; logged.forEach(function(k){ lg[k]=pctOn(k); });

    var s='';
    for(var y=0;y<rows;y++){
      var startDay=Math.floor(y*365.2425)+1;             /* 1-based day-of-life at this row's start */
      var endDay=Math.floor((y+1)*365.2425);
      var rowY=y*(CH+GAP);
      /* the row's ground: future/unlived */
      s+='<rect x="0" y="'+rowY+'" width="'+(cols*(CW+GAP)-GAP)+'" height="'+CH+
         '" fill="var(--sunk)" opacity=".45"/>';
      /* the lived RUN on this row */
      var livedTo=Math.min(endDay,dayNo);
      if(livedTo>=startDay){
        var n0=livedTo-startDay+1;
        var wCells=perWeek?Math.ceil(n0/7):n0;
        var runW=Math.min(cols,wCells)*(CW+GAP)-GAP;
        if(runW>0) s+='<rect x="0" y="'+rowY+'" width="'+runW+'" height="'+CH+
                      '" fill="var(--rule2)"/>';
      }
    }
    /* the logged days, each in its own cell, coloured by completion */
    logged.forEach(function(k){
      var d=Math.floor((dnum(k)-b)/864e5)+1; if(d<1) return;
      var y=Math.floor((d-1)/365.2425);
      if(y>=rows) return;
      var within=d-Math.floor(y*365.2425)-1;
      var cx=perWeek?Math.floor(within/7):within;
      if(cx>=cols) cx=cols-1;
      s+='<rect x="'+(cx*(CW+GAP))+'" y="'+(y*(CH+GAP))+'" width="'+CW+'" height="'+CH+
         '" fill="'+gfill(lg[k])+'"/>';
    });
    /* today, outlined — the wire asks for the outline by name. Drawn LAST, over the grid overlay. */
    var todayRect='';
    var td=Math.floor((dnum(today())-b)/864e5)+1;
    var ty=Math.floor((td-1)/365.2425);
    if(ty<rows){
      var tw=td-Math.floor(ty*365.2425)-1;
      var tx=perWeek?Math.floor(tw/7):tw;
      todayRect='<rect class="tdy" x="'+(tx*(CW+GAP)-0.5)+'" y="'+(ty*(CH+GAP)-0.5)+'" width="'+(CW+1)+
         '" height="'+(CH+1)+'" fill="none" stroke="var(--ink)" stroke-width="1"/>';
    }
    /* THE CELL TEXTURE, and why it is a pattern and not 29,200 rects.
       Drawing each lived year as one run is what keeps this cheap — but a run has no cell edges, and
       measured on the phone the graph came out as 80 solid stripes. The whole claim of this view is
       "one cell at a time", so the texture is not decoration; it IS the view. One <pattern> of gap
       lines laid over the finished drawing restores every cell edge at any density, for two nodes. */
    var CELL=(CW+GAP);
    var pat='<defs><pattern id="lifecell" width="'+CELL+'" height="'+CELL+
      '" patternUnits="userSpaceOnUse">'+
      '<rect x="'+CW+'" y="0" width="'+GAP+'" height="'+CELL+'" fill="var(--ground)"/>'+
      '<rect x="0" y="'+CH+'" width="'+CELL+'" height="'+GAP+'" fill="var(--ground)"/>'+
      '</pattern></defs>';
    host.innerHTML='<svg class="lifeg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMinYMin meet">'+
      pat+s+
      '<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="url(#lifecell)" pointer-events="none"/>'+
      todayRect+'</svg>';
    if(cap) cap.textContent =
      'Day '+dayNo.toLocaleString()+' of ~'+totalDays.toLocaleString()+
      ' · ~'+left.toLocaleString()+' days left at '+tgt+
      ' · '+logged.length+' days logged'+
      (mean==null?'':' · '+Math.round(mean)+'% mean completion');
  }

  /* ---- B3 · THE TWO GRIDS · one ramp for both --------------------------------------- */
  function monthGrid(id,mode){
    var host=document.getElementById(id); if(!host) return;
    var ym=S.vYM||(S.vYM=[dnum(today()).getFullYear(),dnum(today()).getMonth()]);
    var y=ym[0], m=ym[1];
    var first=new Date(y,m,1), start=new Date(first);
    start.setDate(1-((first.getDay()+6)%7));                /* Monday-led, like the app's own grid */
    var h=DOW.map(function(d){ return '<div class="hd">'+d.slice(0,2)+'</div>'; }).join('');
    for(var i=0;i<42;i++){
      var d=new Date(start); d.setDate(start.getDate()+i);
      var k=dk(d), out=(d.getMonth()!==m), fut=(k>today());
      var v,f,txt='';
      if(mode==='rate'){
        /* a day RATED but not logged still colours here — the rating is its own input (R35.6) */
        v=ratingOf(k); f=(v==null?'var(--sunk)':dens(v*10)); if(v!=null) txt=v;
      } else {
        v=fut?null:pctOn(k); f=dens(v); if(v!=null) txt=v;
      }
      h+='<button class="d'+(out?' out':'')+(k===today()?' tdy':'')+'" data-vd="'+k+
         '" style="background:'+f+'"><b>'+d.getDate()+'</b>'+
         (txt===''?'':'<s>'+txt+'</s>')+'</button>';
    }
    host.innerHTML=h;
    var nav=document.getElementById('vNav');
    if(nav && id==='vMonthC')
      nav.innerHTML='<button class="mv" data-vm="-1">‹</button> '+MO[m]+' '+y+
                    ' <button class="mv" data-vm="1">›</button>';
    var cap=document.getElementById(id==='vMonthC'?'vMonthCC':'vMonthRC');
    if(cap){
      var days=[],i2;
      for(i2=1;i2<=31;i2++){ var dd=new Date(y,m,i2); if(dd.getMonth()!==m) break;
        days.push(dk(dd)); }
      if(mode==='rate'){
        var rs=days.map(ratingOf).filter(function(x){return x!=null;});
        cap.textContent = rs.length? rs.length+' rated · mean '+(meanOf(rs)).toFixed(1) : 'nothing rated';
      } else {
        var ps=days.map(pctOn).filter(function(x){return x!=null;});
        cap.textContent = ps.length? ps.length+' logged · mean '+Math.round(meanOf(ps))+'%' : 'nothing logged';
      }
    }
  }

  /* ---- B4 · TRENDS · two lines, one axis, and GAPS BREAK THE LINE -------------------
     A line drawn across a gap asserts a day that never happened. Each unbroken run is its own path. */
  function paintTrends(){
    var svg=document.getElementById('vTrends'); if(!svg) return;
    var range=S.vRange||'30';
    var all=dates();
    var N = range==='all' ? Math.max(14,(all.length?Math.floor((dnum(today())-dnum(all[0]))/864e5)+1:14))
                          : +range;
    /* a hidden surface measures 0 wide (the phone's Today tab), and fitSvg would floor it to its
       240 minimum and draw a chart nobody asked for at the wrong scale. Draw when it is visible. */
    if(!svg.getClientRects().length) return;
    var H=132, W=fitSvg('vTrends',H);
    var ks=[]; for(var i=N-1;i>=0;i--) ks.push(shift(today(),-i));
    var px=function(i){ return 26+i*(W-34)/Math.max(1,N-1); };
    var py=function(v){ return H-18-(v/100)*(H-32); };
    var s='';
    [0,50,100].forEach(function(v){
      s+='<line class="ax" x1="24" y1="'+py(v)+'" x2="'+(W-4)+'" y2="'+py(v)+'"/>'+
         '<text x="20" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'; });
    /* series: 7-day rolling completion, and 7-day rolling rating x10 on the same 0-100 axis */
    function runs(valAt){
      var out=[], cur=[];
      ks.forEach(function(k,i){
        var v=valAt(k);
        if(v==null){ if(cur.length){ out.push(cur); cur=[]; } return; }
        cur.push([i,v]);
      });
      if(cur.length) out.push(cur);
      return out;
    }
    function draw(rs,cls){
      return rs.map(function(r){
        if(r.length===1) return '<circle class="'+cls+'-d" cx="'+px(r[0][0])+'" cy="'+py(r[0][1])+'" r="1.6"/>';
        return '<path class="'+cls+'" d="'+r.map(function(p,j){
          return (j?'L':'M')+px(p[0]).toFixed(1)+' '+py(p[1]).toFixed(1); }).join(' ')+'"/>';
      }).join('');
    }
    /* a rolling value exists only where the day itself is logged/rated — otherwise it is a gap */
    var cRuns=runs(function(k){ return pctOn(k)==null?null:rolling(7,k); });
    var rRuns=runs(function(k){ var v=ratingOf(k); if(v==null) return null;
                                var rr=rollRate(7,k); return rr==null?null:rr*10; });
    svg.innerHTML=s+draw(cRuns,'ln-c')+draw(rRuns,'ln-r');
    var cap=document.getElementById('vTrendsC');
    if(cap){
      var gaps=0, prev=null;
      ks.forEach(function(k){ var on=pctOn(k)!=null; if(prev===true&&!on) gaps++; prev=on; });
      cap.textContent='7-day rolling · completion + rating ×10 · '+
        (gaps? gaps+' gap'+(gaps>1?'s':'')+' break the line' : 'no gaps');
    }
  }

  /* ---- B5 · GROUP ADHERENCE -----------------------------------------------------------------
     THE BAR RENDERER IS GONE (HT-16 S5 · R70.97 · R70.79 · DEC-096). It drew one column per group
     into `#vGroups` for the selected calendar month. Its named replacement -- the scorecard, worst
     first, with the delta, the streak, the weakest habit, a 12-week sparkline and an on-time column
     -- lands in the same commit and renders into the same node. Two renderers for one number is how
     a surface starts disagreeing with itself, so there is only ever one. */
  function weekKey(k){ var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dk(d); }

  /* ---- B6 · THREE INSIGHTS, each one line and one small chart -----------------------
     GATES ARE THE POINT. Below the gate the line names what is missing IN WORDS, with no number in
     it — an insight computed from nine days is noise with a decimal point, and this lane has already
     watched a capacity score mislead at n=13. ① reports ASSOCIATION: the copy says "goes with". */
  function insights(){
    var host=document.getElementById('vInsights'); if(!host) return;
    var logged=loggedDates();
    var nLogged=logged.length;
    var weeksSpanned=(function(){
      if(!logged.length) return 0;
      var w={}; logged.forEach(function(k){ w[weekKey(k)]=1; });
      return Object.keys(w).length;
    })();
    var out=[], dowMeans=null;

    /* ① RATING LIFT — mean rating on days a standard was done vs days it was not */
    if(nLogged<14){
      out.push(card('Rating lift',
        'Not enough logged days yet — this one needs a couple of weeks of days before it can say anything honest.',
        ''));
    } else {
      var rank=[];
      S.habits.forEach(function(h){
        var on=[], off=[];
        logged.forEach(function(k){
          var v=ratingOf(k); if(v==null) return;
          (doneOn(h,k)?on:off).push(v);
        });
        if(on.length<3||off.length<3) return;
        rank.push({ n:label(h.name), lift:meanOf(on)-meanOf(off), on:on.length, off:off.length });
      });
      rank.sort(function(a,b){ return b.lift-a.lift; });
      if(!rank.length){
        out.push(card('Rating lift',
          'No standard has enough days both done and not done to compare yet.',''));
      } else {
        var top=rank[0];
        var bars=rank.slice(0,5);
        var mx=Math.max.apply(null,bars.map(function(r){ return Math.abs(r.lift); }))||1;
        out.push(card('Rating lift',
          '<b>Your one thing: '+esc(top.n)+' ('+(top.lift>=0?'+':'')+top.lift.toFixed(1)+')</b> — '+
          'rating goes with doing it, on '+top.on+' days done against '+top.off+' not. '+
          /* the wire forbids the word, and it is right to: "goes with" is the whole claim. Which way
             round it runs — or whether a third thing drives both — this cannot tell you. */
          '<i>Association only — it does not say which way round it runs.</i>',
          '<div class="vbars">'+bars.map(function(r){
            var w=Math.round(Math.abs(r.lift)/mx*100);
            return '<div class="vb"><span class="k">'+esc(r.n)+'</span>'+
              '<span class="t"><i style="width:'+w+'%;background:'+
              (r.lift>=0?'var(--accent)':'var(--rule2)')+'"></i></span>'+
              '<span class="v num">'+(r.lift>=0?'+':'')+r.lift.toFixed(1)+'</span></div>';
          }).join('')+'</div>'));
      }
    }

    /* ② WEEKDAY PROFILE — completion % and mean rating by weekday */
    if(weeksSpanned<4){
      out.push(card('Weekday profile',
        'Not enough weeks yet — a weekday needs to come round several times before its number means anything.',
        ''));
    } else {
      var pc=[[],[],[],[],[],[],[]], rt=[[],[],[],[],[],[],[]];
      logged.forEach(function(k){
        var i=(dnum(k).getDay()+6)%7;
        var p=pctOn(k); if(p!=null) pc[i].push(p);
        var v=ratingOf(k); if(v!=null) rt[i].push(v);
      });
      var means=pc.map(function(a){ return a.length?Math.round(meanOf(a)):null; });
      var worst=null;
      means.forEach(function(v,i){ if(v==null) return; if(worst==null||v<means[worst]) worst=i; });
      out.push(card('Weekday profile',
        worst==null?'Nothing to rank yet.':
          '<b>'+DOWFULL[worst]+'s break you ('+means[worst]+'%)</b> — your weakest weekday across '+
          weeksSpanned+' weeks.',
        '<div class="cols" id="vDow"></div>'));
      dowMeans=means;
    }

    /* ③ CONSISTENCY — coverage and momentum. No gate: both are honest at any n. */
    var elapsed=30, cov=0;
    for(var i=0;i<elapsed;i++){ if(pctOn(shift(today(),-i))!=null) cov++; }
    var r7=rolling(7), r30=rolling(30);
    var mom=(r7==null||r30==null)?null:(r7-r30);
    out.push(card('Consistency',
      '<b>Logged '+cov+' of '+elapsed+'</b>'+
      (mom==null?' · not enough to compare your 7-day with your 30-day yet'
               :' · 7-day is '+(mom>=0?'+':'')+mom+' over your 30-day'),
      '<div class="vmeter"><i style="width:'+Math.round(cov/elapsed*100)+'%"></i></div>'+
      '<div class="vsub">'+(r7==null?'—':r7+'% last 7')+' · '+(r30==null?'—':r30+'% last 30')+'</div>'));

    host.innerHTML=out.join('');
    if(dowMeans){
      colChart('vDow', dowMeans, DOW.map(function(d){ return d[0]; }), 100,
        function(x){ return x+'%'; }, dens);
    }
    var cap=document.getElementById('vInsightsC');
    if(cap) cap.textContent=nLogged+' logged day'+(nLogged===1?'':'s')+
      (nLogged<14?' · one gate still closed':'');
  }
  function card(t,line,chart){
    return '<div class="vins"><div class="lab">'+t+'</div>'+
           '<div class="vline">'+line+'</div>'+(chart||'')+'</div>';
  }

  /* ---- B1 · the two Settings fields ------------------------------------------------- */
  function settingsFields(){
    var b=document.getElementById('pBirth'); if(!b) return;
    if(document.getElementById('pTarget')) return;
    var host=b.closest('.fld'); if(!host) return;
    var lab=host.querySelector('.lab');
    if(lab) lab.textContent='Birthday · powers the life graph';
    var f=document.createElement('label');
    f.className='fld';
    f.innerHTML='<span class="lab">Target age · the life graph’s horizon</span>'+
      '<input id="pTarget" class="num" type="number" min="1" max="120" step="1" '+
      'value="'+(S.priv0&&S.priv0.target_age!=null?S.priv0.target_age:'')+'" '+
      'placeholder="'+DEFAULT_TARGET+'">';
    host.parentNode.insertBefore(f,host.nextSibling);
    if(!S.hasTargetAge){
      var n=document.createElement('div');
      n.className='note'; n.style.padding='6px 0 0';
      n.textContent='Target age needs one migration before it can be saved; the graph uses '+
        DEFAULT_TARGET+' until then.';
      f.parentNode.insertBefore(n,f.nextSibling);
      document.getElementById('pTarget').disabled=true;
    }
    var about=document.createElement('div');
    about.className='note'; about.id='vAbout'; about.style.padding='8px 0 0';
    about.innerHTML='<b>About this view</b> — the life graph is one cell per day of your life. '+
      'The idea is <a href="'+LIFE_ESSAY+'" target="_blank" rel="noopener">Your Life in Weeks</a>. '+
      'A link, not a copy.';
    f.parentNode.insertBefore(about, f.nextSibling);
  }

  /* ---- the tab switcher, below 1024px only ------------------------------------------ */
  function tabs(){
    if(document.getElementById('vTabs')) return;
    var mast=document.querySelector('.mast'); if(!mast) return;
    var t=document.createElement('div');
    t.className='seg vtabs'; t.id='vTabs';
    t.innerHTML='<button data-v="today" class="on">Today</button><button data-v="views">Views</button>';
    mast.parentNode.insertBefore(t,mast.nextSibling);
    t.addEventListener('click',function(e){
      var b=e.target.closest('[data-v]'); if(!b) return;
      show(b.getAttribute('data-v'));
    });
  }
  function show(which){
    S.vTab = which==='views'?'views':'today';
    document.documentElement.setAttribute('data-vtab',S.vTab);
    q('#vTabs button').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-v')===S.vTab); });
    try{ localStorage.setItem('ht_vtab',S.vTab); }catch(e){}
    if(S.vTab==='views') repaint();
  }

  /* ---- wiring ----------------------------------------------------------------------- */
  function bind(){
    var sec=document.getElementById('vViews'); if(!sec || sec.dataset.bound) return;
    sec.dataset.bound='1';
    sec.addEventListener('click',function(e){
      var mv=e.target.closest('[data-vm]');
      if(mv){
        var d=+mv.getAttribute('data-vm');
        var ym=S.vYM||[dnum(today()).getFullYear(),dnum(today()).getMonth()];
        var m=ym[1]+d, y=ym[0];
        if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
        S.vYM=[y,m];
        monthGrid('vMonthC','pct'); monthGrid('vMonthR','rate'); paintGroups13();
        return;
      }
      var r=e.target.closest('[data-r]');
      if(r){
        S.vRange=r.getAttribute('data-r');
        q('#vRange button').forEach(function(b){ b.classList.toggle('on',b===r); });
        paintTrends(); return;
      }
      var d2=e.target.closest('[data-vd]');
      if(d2){ var k=d2.getAttribute('data-vd'); if(k<=today()){ goDay(k); show('today'); } }
    });
    var rT=null;
    window.addEventListener('resize',function(){
      clearTimeout(rT); rT=setTimeout(function(){
        if(!document.getElementById('vViews')) return;
        paintLife13(); paintTrends(); },200);
    });
  }

  function repaint(){
    if(!document.getElementById('vViews')) return;
    paintLife13();
    monthGrid('vMonthC','pct'); monthGrid('vMonthR','rate');
    paintTrends(); insights();          /* group adherence is HT-16's scorecard now */
  }
  window.__HT13_REPAINT=repaint;
  /* HT-15 needs this: clicking a dot on the month graph navigates TODAY, and on the phone the
     navigation is invisible unless the tab comes back with it. */
  window.__HT13_TAB=show;

  function boot(){
    if(advanced()) return;                 /* the full sheet already renders all of this */
    if(!S.me) return;                      /* signed out: nothing to draw */
    if(!build()) return;
    tabs(); bind();
    var saved='today';
    try{ saved=localStorage.getItem('ht_vtab')||'today'; }catch(e){}
    show(saved==='views'?'views':'today');
    repaint();
  }

  /* re-apply after the app repaints, the way 9a · 10 · 11 do */
  var _pa=paintAll;   paintAll   = function(){ _pa.apply(null,arguments); boot(); };
  var _os=openSettings; openSettings = function(){ _os.apply(null,arguments);
                                                   setTimeout(settingsFields,90); };
  if(document.readyState==='complete') setTimeout(boot,200);
  else window.addEventListener('load',function(){ setTimeout(boot,200); });
})();

/* ======================= HT-15 · VIEWS v2 (PASTE 42 §1–§2 · R70.67–R70.72) =======================
   Cory looked at HT-13's Views and cut most of them. Out of sight: the three insights, the trends line,
   both month grids, and the life view as built. In: a month LINE graph whose dots are clickable, a year
   graph of the same two series, and life-in-weeks across the bottom. And the journal moves to the top
   of TODAY, above the check-offs.

   NOTHING IS DELETED (R70.16). The six removed views keep their code, their data and their tests; they
   are hidden by the same `html[data-simple]` mechanism 9a established, so Settings -> Advanced brings
   all of it straight back and `golden_ht6` still reaches it. That is why the suite stays 17/17 in both
   modes, three wires running.

   THE FIFTH LAYER, inside the same sealed closure (9a · 10 · 11 · 13 · 15). It must run AFTER the
   earlier four: 9a's restructure() and 10's journalise() both assemble the journal, and reordering
   before them flips back on the next repaint. Guarded with data-ht15 and re-asserted from the same
   patched paints the earlier layers use. */
(function(){
  var DEFAULT_TARGET = 90;         /* R70.68 — HT-13 used 80; this wire supersedes it */
  var WEEKS_ESSAY = 'https://www.bryanbraun.com/your-life/weeks.html';
  var MSWEEK = 6048e5;

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function birth(){ var b=S.priv0&&S.priv0.birth_date; return b?new Date(b+'T12:00:00'):null; }
  function targetAge(){
    var t=S.priv0&&S.priv0.target_age;
    return (t==null||t==='')?DEFAULT_TARGET:+t;
  }
  function pctOn(k){ var r=S.byDate[k]; return (r&&r.pct!=null&&loggedOn(k))?r.pct:null; }
  function meanOf(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }
  function gfill(p){ var g=grade(p); return g[1]==null?'var(--sunk)':'var(--g'+Math.max(1,g[1])+')'; }
  function monthKeys(y,m){
    var out=[]; for(var i=1;i<=31;i++){ var d=new Date(y,m,i); if(d.getMonth()!==m) break; out.push(dk(d)); }
    return out;
  }
  function phone(){ return window.innerWidth < 1024; }

  /* ---- B3/B4 · ONE LINE-CHART RENDERER, two series, gaps break the line ----------------
     Month and year are the same chart over a different x domain, so they are one function. A gap is
     never interpolated: each unbroken run is its own <path>, because a line drawn across a missing day
     asserts a day that never happened. */
  function lineChart(svgId, pts, opts){
    var svg=document.getElementById(svgId); if(!svg) return;
    if(!svg.getClientRects().length) return;          /* hidden surface measures 0 wide */
    var H=opts.height||150, W=fitSvg(svgId,H);
    var L=26, R=30, T=12, B=22;                        /* room for BOTH axes and the x labels */
    var n=pts.length;
    var px=function(i){ return n<2 ? L+(W-L-R)/2 : L+i*(W-L-R)/(n-1); };
    var py=function(v){ return H-B-(v/100)*(H-T-B); };
    var s='';
    /* left axis 0-100 (completion) and right axis 0-10 (rating, in its own units) */
    [0,50,100].forEach(function(v){
      s+='<line class="ax" x1="'+L+'" y1="'+py(v)+'" x2="'+(W-R)+'" y2="'+py(v)+'"/>'+
         '<text x="'+(L-4)+'" y="'+(py(v)+3)+'" text-anchor="end">'+v+'</text>'+
         '<text class="ax2" x="'+(W-R+4)+'" y="'+(py(v)+3)+'">'+(v/10)+'</text>';
    });
    function runs(get){
      var out=[], cur=[];
      pts.forEach(function(p,i){ var v=get(p);
        if(v==null){ if(cur.length){ out.push(cur); cur=[]; } return; }
        cur.push([i,v]); });
      if(cur.length) out.push(cur);
      return out;
    }
    function draw(rs,cls){
      return rs.map(function(r){
        if(r.length===1) return '<circle class="'+cls+'-d" cx="'+px(r[0][0]).toFixed(1)+
                                '" cy="'+py(r[0][1]).toFixed(1)+'" r="1.8"/>';
        return '<path class="'+cls+'" d="'+r.map(function(p,j){
          return (j?'L':'M')+px(p[0]).toFixed(1)+' '+py(p[1]).toFixed(1); }).join(' ')+'"/>';
      }).join('');
    }
    s+=draw(runs(function(p){ return p.c; }),'ln-c');
    s+=draw(runs(function(p){ return p.r==null?null:p.r*10; }),'ln-r');
    /* the dots, and behind each a hit area no smaller than 24px: a 4px target on a phone is
       decoration, not a control (R70.69). */
    pts.forEach(function(p,i){
      if(p.c==null && p.r==null) return;
      var tip=(p.c==null?'—':Math.round(p.c)+'%')+' · '+(p.r==null?'—':p.r+'/10');
      var at=opts.attr+'="'+p.key+'"';
      if(p.c!=null) s+='<circle class="dot dot-c" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
                       '" cy="'+py(p.c).toFixed(1)+'" r="2.6"/>';
      if(p.r!=null) s+='<circle class="dot dot-r" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
                       '" cy="'+py(p.r*10).toFixed(1)+'" r="2.2"/>';
      s+='<circle class="hit" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
         '" cy="'+(H/2)+'" r="12"/>';
    });
    /* x labels: every label on the year chart, a readable subset on the month chart */
    pts.forEach(function(p,i){
      if(opts.everyLabel || i===0 || i===n-1 || (i+1)%5===0)
        s+='<text class="xl" x="'+px(i).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle">'+
           esc(p.x)+'</text>';
    });
    svg.innerHTML=s;
  }

  /* ---- B3 · THE MONTH GRAPH ------------------------------------------------------------ */
  function paintMonthGraph(){
    var ym=S.calYM||(S.calYM=[dnum(today()).getFullYear(),dnum(today()).getMonth()]);
    var y=ym[0], m=ym[1];
    var pts=monthKeys(y,m).map(function(k,i){
      return { x:String(i+1), key:k, c:pctOn(k), r:ratingOf(k) };
    });
    lineChart('vMonth', pts, { attr:'data-vgd', height:150 });
    var nav=document.getElementById('vMonthNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgm="-1">‹</button>'+
      '<b>'+MO[m].toUpperCase()+' '+y+'</b>'+
      '<button class="mv" data-vgm="1">›</button>'+
      '<span class="lg"><i class="s-c"></i>completion<i class="s-r"></i>rating ×10</span>';
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vMonthTip');
    if(tip) tip.textContent = got? got+' logged this month · tap a dot to go to that day'
                                 : 'nothing logged this month yet';
  }

  /* ---- B4 · THE YEAR GRAPH · clicking a month drills into the month graph -------------- */
  function paintYearGraph(){
    var yr=S.vYear||(S.vYear=dnum(today()).getFullYear());
    var pts=[];
    for(var m=0;m<12;m++){
      var ks=monthKeys(yr,m);
      var cs=ks.map(pctOn).filter(function(v){ return v!=null; });
      var rs=ks.map(ratingOf).filter(function(v){ return v!=null; });
      /* a month with no logged day is a GAP, not a zero — a zero would read as a month of failure */
      pts.push({ x:MO[m][0], key:String(m),
                 c: cs.length? Math.round(meanOf(cs)) : null,
                 r: rs.length? Math.round(meanOf(rs)*10)/10 : null });
    }
    lineChart('vYear', pts, { attr:'data-vgy', height:150, everyLabel:true });
    var nav=document.getElementById('vYearNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgyn="-1">‹</button><b>'+yr+'</b>'+
      '<button class="mv" data-vgyn="1">›</button>'+
      '<span class="lg">tap a month to open it below</span>';
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vYearTip');
    if(tip) tip.textContent=got+' of 12 months logged';
  }

  /* ---- B5 · LIFE IN WEEKS · full width, the bottom of the whole app -------------------
     Our own markup and our own skin. The concept is the well-known "your life in weeks" chart and it
     is CREDITED AND LINKED in Settings -> About; nothing is copied from it — not a stylesheet, not a
     snippet, not an asset.
     ~4,700 cells, drawn the way HT-13 learned to: one run per year plus one <pattern> for the cell
     edges. A run alone has no edges and renders as solid stripes; the texture IS the chart. */
  function paintWeeks(){
    var host=document.getElementById('vWeeks'); if(!host) return;
    var cap=document.getElementById('vWeeksC');
    var b=birth(), tgt=targetAge();
    var GAP=1, cols=52;
    var logged=dates().filter(function(k){ return pctOn(k)!=null; });

    if(!b){
      /* it does not guess: the logged weeks only, and one sentence with no number in it */
      var wk={};
      logged.forEach(function(k){ var m=weekMon(k); (wk[m]=wk[m]||[]).push(pctOn(k)); });
      var keys=Object.keys(wk).sort();
      var C=9, W0=Math.max(1,keys.length)*(C+GAP);
      host.innerHTML='<div class="wkscroll"><svg class="wkg" width="'+W0+'" height="'+(C+GAP)+
        '" viewBox="0 0 '+W0+' '+(C+GAP)+'">'+
        keys.map(function(m,i){
          return '<rect x="'+(i*(C+GAP))+'" y="0" width="'+C+'" height="'+C+'" fill="'+
                 gfill(meanOf(wk[m]))+'"/>'; }).join('')+'</svg></div>'+
        '<div class="vempty">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent='the weeks you have logged';
      return;
    }

    var rows=tgt;
    var LEFT=24, TOP=14;
    var born=b;
    var bornMon=new Date(born); bornMon.setDate(bornMon.getDate()-((bornMon.getDay()+6)%7));
    var nowWeeks=Math.floor((new Date()-bornMon)/MSWEEK);
    var totalWeeks=rows*cols;
    var left=Math.max(0,totalWeeks-nowWeeks);
    /* mean completion for each week of life that carries a logged day */
    var byWeek={};
    logged.forEach(function(k){
      var wi=Math.floor((dnum(k)-bornMon)/MSWEEK);
      if(wi<0) return; (byWeek[wi]=byWeek[wi]||[]).push(pctOn(k));
    });

    function render(cell){
      var W=LEFT+cols*(cell+GAP), H=TOP+rows*(cell+GAP);
      var s='<text class="wl" x="'+LEFT+'" y="'+(TOP-5)+'">weeks →</text>';
      for(var r=0;r<rows;r++){
        var yy=TOP+r*(cell+GAP);
        s+='<rect x="'+LEFT+'" y="'+yy+'" width="'+(cols*(cell+GAP)-GAP)+'" height="'+cell+
           '" fill="var(--sunk)" opacity=".45"/>';
        var start=r*cols, end=start+cols-1;
        var livedTo=Math.min(end,nowWeeks);
        if(livedTo>=start){
          var w=(livedTo-start+1)*(cell+GAP)-GAP;
          if(w>0) s+='<rect x="'+LEFT+'" y="'+yy+'" width="'+w+'" height="'+cell+
                     '" fill="var(--rule2)"/>';
        }
        if(r>0 && r%10===0)
          s+='<text class="wl" x="'+(LEFT-5)+'" y="'+(yy+cell)+'" text-anchor="end">'+r+'</text>';
      }
      /* the logged weeks, coloured by that week's mean completion */
      Object.keys(byWeek).forEach(function(wi){
        var i=+wi, r=Math.floor(i/cols), c=i%cols;
        if(r>=rows) return;
        s+='<rect class="lw" x="'+(LEFT+c*(cell+GAP))+'" y="'+(TOP+r*(cell+GAP))+'" width="'+cell+
           '" height="'+cell+'" fill="'+gfill(meanOf(byWeek[wi]))+'"/>';
      });
      /* the cell texture, then the current week outlined on top of it */
      var P=cell+GAP;
      var pat='<defs><pattern id="wkcell" width="'+P+'" height="'+P+'" patternUnits="userSpaceOnUse">'+
        '<rect x="'+cell+'" y="0" width="'+GAP+'" height="'+P+'" fill="var(--ground)"/>'+
        '<rect x="0" y="'+cell+'" width="'+P+'" height="'+GAP+'" fill="var(--ground)"/></pattern></defs>';
      var cur='';
      var cr=Math.floor(nowWeeks/cols), cc=nowWeeks%cols;
      if(cr<rows) cur='<rect class="cw" x="'+(LEFT+cc*(cell+GAP)-0.5)+'" y="'+(TOP+cr*(cell+GAP)-0.5)+
        '" width="'+(cell+1)+'" height="'+(cell+1)+'" fill="none" stroke="var(--ink)" stroke-width="1"/>';
      return { svg:pat+s+'<rect x="'+LEFT+'" y="'+TOP+'" width="'+(cols*(cell+GAP))+'" height="'+
                 (rows*(cell+GAP))+'" fill="url(#wkcell)" pointer-events="none"/>'+cur,
               W:W, H:H };
    }

    var cell = phone()? 9 : 12;
    var cc=nowWeeks%cols;                       /* the current week's column, for the scroll below */
    var o=render(cell);
    /* phone: a FIXED cell size in a horizontal scroller — never squeezed to illegibility.
       desktop: the same drawing, scaled to the width it has. */
    host.innerHTML='<div class="wkscroll'+(phone()?'':' fit')+'">'+
      '<svg class="wkg" viewBox="0 0 '+o.W+' '+o.H+'"'+
      (phone()? ' width="'+o.W+'" height="'+o.H+'"' : ' preserveAspectRatio="xMinYMin meet"')+
      '>'+o.svg+'</svg></div>';
    if(cap) cap.textContent='Week '+nowWeeks.toLocaleString()+' of ~'+totalWeeks.toLocaleString()+
      ' · '+left.toLocaleString()+' weeks left at '+tgt+' · '+logged.length+' days logged';
    /* SCROLL THE CURRENT WEEK INTO VIEW, and it is not a nicety.
       MEASURED on the phone: the grid is a fixed-cell horizontal scroller (R70.68 — never squeezed),
       the current week sits at column 41 of 52, and the visible strip is ~34 columns wide. So the one
       cell the chart exists to show, and every logged week beside it, opened OFF SCREEN and the whole
       thing read as empty. Centre it on load instead. */
    var sc=host.querySelector('.wkscroll');
    if(sc && sc.scrollWidth>sc.clientWidth){
      var x=LEFT+cc*(cell+GAP);
      sc.scrollLeft=Math.max(0, x-sc.clientWidth/2);
    }
  }
  function weekMon(k){ var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dk(d); }

  /* ---- build the two graphs into #vViews, and the weeks section full width ------------- */
  function build(){
    var views=document.getElementById('vViews');
    if(views && !document.getElementById('vMonth')){
      var wrap=document.createElement('div');
      wrap.id='vGraphs';
      wrap.innerHTML=
        '<div class="sh"><h2>The month</h2><span class="ln"></span>'+
          '<span class="c" id="vMonthTip"></span></div>'+
        '<div class="gnav" id="vMonthNav"></div>'+
        '<div class="pan flat"><svg id="vMonth" class="chart"></svg></div>'+
        '<div class="sh"><h2>The year</h2><span class="ln"></span>'+
          '<span class="c" id="vYearTip"></span></div>'+
        '<div class="gnav" id="vYearNav"></div>'+
        '<div class="pan flat"><svg id="vYear" class="chart"></svg></div>';
      views.insertBefore(wrap, views.firstChild);       /* the graphs lead the Views surface */
    }
    if(!document.getElementById('vWeeks')){
      var grid=document.querySelector('.grid'); if(!grid) return;
      var sec=document.createElement('section');
      sec.id='vWeeksSec'; sec.className='vWeeksSec';
      sec.innerHTML='<div class="sh"><h2>Life in weeks</h2><span class="ln"></span>'+
        '<span class="c" id="vWeeksC"></span></div><div id="vWeeks"></div>'+
        '<div class="note vabout">One square per week of your life — the idea is the well-known '+
        '<a href="'+WEEKS_ESSAY+'" target="_blank" rel="noopener">your life in weeks</a> chart. '+
        'Ours is drawn from scratch in this skin.</div>';
      grid.parentNode.insertBefore(sec, grid.nextSibling);   /* after BOTH columns, full width */
    }
  }

  /* ---- B2 · JOURNAL FIRST (R70.71) ----------------------------------------------------
     Idempotent, and re-asserted from the patched paints: 9a's restructure() and 10's journalise()
     both assemble this block, and moving it before they run would flip back on the next repaint. */
  function journalFirst(){
    if(advanced()) return;
    var jIn=document.getElementById('jIn'); if(!jIn) return;
    var dump=document.getElementById('iDump'); if(!dump) return;   /* layer 10 not up yet */
    var blk=dump.closest('.blk'); if(!blk) return;
    if(jIn.firstElementChild===blk) return;                        /* already first: nothing to do */
    jIn.insertBefore(blk, jIn.firstElementChild);
    /* CLOSE THE DAY stays the last child, and stays sticky — never fixed */
    var t=document.getElementById('tClose');
    if(t && jIn.lastElementChild!==t) jIn.appendChild(t);
    document.documentElement.setAttribute('data-ht15','1');
  }

  /* ---- Settings -> About gains the weeks credit ---------------------------------------- */
  function aboutCredit(){
    var a=document.getElementById('vAbout'); if(!a || a.dataset.ht15) return;
    a.dataset.ht15='1';
    var d=document.createElement('div');
    d.style.paddingTop='6px';
    d.innerHTML='<b>Life in weeks</b> — one square per week, birth year to your target age. '+
      'Inspired by <a href="'+WEEKS_ESSAY+'" target="_blank" rel="noopener">your life in weeks</a>; '+
      'our markup and our skin, nothing copied.';
    a.appendChild(d);
  }

  /* ---- wiring ------------------------------------------------------------------------- */
  function bind(){
    var views=document.getElementById('vViews');
    if(views && !views.dataset.ht15){
      views.dataset.ht15='1';
      views.addEventListener('click',function(e){
        var mn=e.target.closest('[data-vgm]');
        if(mn){ var d=+mn.getAttribute('data-vgm');
          var ym=S.calYM||[dnum(today()).getFullYear(),dnum(today()).getMonth()];
          var m=ym[1]+d, y=ym[0];
          if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
          S.calYM=[y,m]; paintMonthGraph(); return; }
        var yn=e.target.closest('[data-vgyn]');
        if(yn){ S.vYear=(S.vYear||dnum(today()).getFullYear())+(+yn.getAttribute('data-vgyn'));
          paintYearGraph(); return; }
        /* B4 drill-down: a month on the year graph opens that month below */
        var ym2=e.target.closest('[data-vgy]');
        if(ym2){ S.calYM=[S.vYear||dnum(today()).getFullYear(), +ym2.getAttribute('data-vgy')];
          paintMonthGraph();
          var t=document.getElementById('vMonthNav'); if(t) t.scrollIntoView({block:'center'});
          return; }
        /* B3: EVERY DOT IS CLICKABLE, and it navigates through the app's own day navigator */
        var d2=e.target.closest('[data-vgd]');
        if(d2){
          var k=d2.getAttribute('data-vgd');
          if(k>today()) return;
          goDay(k);                                  /* the same call the header's arrows make */
          if(phone() && window.__HT13_TAB) window.__HT13_TAB('today');
          return;
        }
      });
      /* the active-dot label: the raw values, in their own units (R70.72) */
      views.addEventListener('pointerover',function(e){
        var h=e.target.closest('[data-tip]'); if(!h) return;
        var svg=h.closest('svg'); if(!svg) return;
        var tip=document.getElementById(svg.id==='vYear'?'vYearTip':'vMonthTip');
        if(tip) tip.textContent=h.getAttribute('data-tip');
      });
    }
    /* THE TAB SWITCH HAS TO REPAINT THIS LAYER TOO, and it is worth saying why.
       `fitSvg` measures clientWidth, so a chart drawn while the Views tab is hidden measures 0 and
       draws nothing — MEASURED: monthDots 7 on desktop, 0 on the phone. HT-13 owns the tab and calls
       its own repaint, which knows nothing about HT-15. Rather than reach into HT-13, add a second
       listener on the same control: both fire, and this one redraws after layout has settled. */
    var tabs=document.getElementById('vTabs');
    if(tabs && !tabs.dataset.ht15){
      tabs.dataset.ht15='1';
      tabs.addEventListener('click',function(e){
        if(e.target.closest('[data-v]')) setTimeout(repaint,60);
      });
    }
    var rT=null;
    if(!window.__HT15_RESIZE){
      window.__HT15_RESIZE=1;
      window.addEventListener('resize',function(){
        clearTimeout(rT); rT=setTimeout(repaint,220);
      });
    }
  }

  function repaint(){
    if(advanced()) return;
    build();
    paintMonthGraph(); paintYearGraph(); paintWeeks();
  }

  function boot(){
    if(advanced()) return;
    if(!S.me) return;
    build(); journalFirst(); bind(); aboutCredit();
    repaint();
  }

  /* re-apply after the app repaints, exactly as the four layers before this one do */
  var _pa=paintAll;      paintAll      = function(){ _pa.apply(null,arguments); boot(); };
  var _pl=paintLog;      paintLog      = function(){ _pl.apply(null,arguments); journalFirst(); };
  var _pm=paintMast;     paintMast     = function(){ _pm.apply(null,arguments); journalFirst(); };
  var _pji=paintJournalInputs;
  paintJournalInputs = function(){ _pji.apply(null,arguments); journalFirst(); };
  var _os=openSettings;  openSettings  = function(){ _os.apply(null,arguments);
                                                     setTimeout(aboutCredit,140); };
  if(document.readyState==='complete') setTimeout(boot,260);
  else window.addEventListener('load',function(){ setTimeout(boot,260); });
})();

/* ======================= HT-16 · THEME · SQUARE · CHARTS · LIFE · SCORECARD · TIME =======================
   THE SIXTH LAYER, inside the same sealed closure (9a · 10 · 11 · 13 · 15). It runs AFTER all five:
   9a restructures, 11 decorates the rows, 13 owns the tab, 15 draws the three surfaces this layer
   re-draws. Appending after the closer would put every app function out of scope — measured, HT-9a.

   WHY IT RE-DRAWS RATHER THAN PATCHES. HT-15's painters are local to HT-15's own IIFE, so they are
   unreachable from here by name. This layer therefore owns the final drawing of `#vMonth`, `#vYear`
   and `#vWeeks`: the same nodes, the same attributes (`data-vgd` · `data-vgy` · `circle.hit` ·
   `rect.lw` · `rect.cw` · `text.wl`), so HT-15's click wiring and its golden both still hold, with
   HT-16's axes, labels, ramp and lived-from-birth fill on top.

   Every acceptance in this wire is a DATA golden, so every computation below is exposed on
   `window.__HT16` — the same seam `window.__HT13_REPAINT` and `window.__HT13_TAB` already are. */
(function(){
  var MSDAY = 864e5, MSWEEK = 6048e5;
  var TARGET_AGE = 100;          /* R70.95 — a constant, for everyone. The stored value is untouched. */
  var LIFE_ROWS = 100, LIFE_COLS = 52, LIFE_TOTAL = LIFE_ROWS * LIFE_COLS;   /* 5,200 */

  function advanced(){
    try{ if(localStorage.getItem('ht_advanced')==='1') return true; }catch(e){}
    if(window.__ADVANCED===true) return true;
    return /[?&]advanced=1/.test(location.search);
  }
  function q(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function phone(){ return window.innerWidth < 1024; }
  function pctOn(k){ var r=S.byDate[k]; return (r&&r.pct!=null&&loggedOn(k))?r.pct:null; }
  function meanOf(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }
  function birth(){ var b=S.priv0&&S.priv0.birth_date; return b?new Date(b+'T12:00:00'):null; }

  /* ---- S1 · THE RAMP ------------------------------------------------------------------------
     ONE ramp, and it is a band table, not a gradient: 0-24 · 25-49 · 50-74 · 75-89 · 90-100.
     `rampIx` is the whole rule; everything else reads it. `null` is UNLOGGED and gets `--surface` —
     never a ramp colour, because an unlogged day must not read as a bad day. */
  function rampIx(p){
    if(p==null) return null;
    if(p<25) return 0; if(p<50) return 1; if(p<75) return 2; if(p<90) return 3; return 4;
  }
  function rampClass(p){ var i=rampIx(p); return i==null?'ramp-none':('ramp-'+i); }
  function rampBg(p){ var i=rampIx(p); return i==null?'rampbg-none':('rampbg-'+i); }
  /* `--g1 … --g5` are mapped onto `--ramp-0 … --ramp-4` in theme.css, so an SVG `fill` written as a
     `--gN` token IS a ramp token. HT-15's golden reads that attribute, and it still reads true. */
  function rampFill(p){ var i=rampIx(p); return i==null?'var(--surface)':('var(--g'+(i+1)+')'); }
  function rampVar(p){ var i=rampIx(p); return i==null?'var(--surface)':('var(--ramp-'+i+')'); }
  function legend(){
    return '<span class="h16leg">'+[0,1,2,3,4].map(function(i){
      return '<i class="rampbg-'+i+'"></i>'; }).join('')+'</span>';
  }

  window.__HT16 = window.__HT16 || {};
  window.__HT16.rampIx = rampIx;
  window.__HT16.rampClass = rampClass;
  window.__HT16.rampFill = rampFill;
  window.__HT16.TARGET_AGE = TARGET_AGE;
  window.__HT16.LIFE_TOTAL = LIFE_TOTAL;

  /* ---- S2 · THE SQUARE (R70.100) --------------------------------------------------------
     One grid, twelve columns, one fixed row unit. The panels have to be DIRECT CHILDREN of `.grid`
     for a column-span to mean anything, and HT-13/HT-15 left them nested two deep inside `#vViews`.
     `display:contents` on the wrapper was the cheaper fix and it is the wrong one: `#vViews` also
     holds eleven hidden instruments and `#vNav`, and every one of them would auto-place itself into
     a column. So the five panels are MOVED, once, idempotently, and `#vViews` keeps everything
     R70.16 says must stay in the tree. */
  function panel(id, cls){
    var n=document.getElementById(id);
    if(!n){ n=document.createElement('div'); n.id=id; }
    n.className='h16p'+(cls?' '+cls:'');
    return n;
  }
  function squareLayout(){
    var grid=document.querySelector('.grid'); if(!grid) return false;
    var vMonth=document.getElementById('vMonth'), vYear=document.getElementById('vYear');
    if(!vMonth || !vYear) return false;                       /* HT-15 has not built yet */

    if(!document.getElementById('h16Month')){
      var pm=panel('h16Month');
      var nav=document.getElementById('vMonthNav');
      var head=nav && nav.previousElementSibling;             /* the .sh carrying #vMonthTip */
      if(head) pm.appendChild(head);
      if(nav) pm.appendChild(nav);
      pm.appendChild(vMonth.closest('.pan') || vMonth);
      grid.appendChild(pm);
    }
    if(!document.getElementById('h16Year')){
      var py=panel('h16Year');
      var ynav=document.getElementById('vYearNav');
      var yhead=ynav && ynav.previousElementSibling;
      if(yhead) py.appendChild(yhead);
      if(ynav) py.appendChild(ynav);
      py.appendChild(vYear.closest('.pan') || vYear);
      grid.appendChild(py);
    }
    if(!document.getElementById('h16Score')){
      var g=document.getElementById('vGroups');
      if(g){
        var ps=panel('h16Score');
        var gh=g.previousElementSibling;                      /* the .sh carrying #vGroupsC */
        if(gh) ps.appendChild(gh);
        ps.appendChild(g);
        grid.appendChild(ps);
      }
    }
    if(!document.getElementById('h16Ins')){
      var pi=panel('h16Ins');
      pi.innerHTML='<div class="sh"><h2>Life</h2><span class="ln"></span>'+
                   '<span class="c" id="h16InsC"></span></div><div id="h16InsBody"></div>';
      grid.appendChild(pi);
    }
    var wk=document.querySelector('.vWeeksSec');
    if(wk && wk.parentNode!==grid) grid.appendChild(wk);
    document.documentElement.setAttribute('data-ht16','1');
    return true;
  }

  /* the measured frame, for the receipt and for the golden */
  function metrics(){
    var app=document.querySelector('.app');
    var r=app?app.getBoundingClientRect():null;
    var row=q('#log .li').filter(function(r){ return r.querySelector('a.nm'); })[0]
            || document.querySelector('#log .li');
    var bx=row&&row.querySelector('.bxw'), ed=row&&row.querySelector('.edp');
    function box(n){ if(!n) return null; var b=n.getBoundingClientRect();
      return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}; }
    function hit(a,b){ if(!a||!b) return null;
      return !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y); }
    var A=box(bx), B=box(ed);
    return { viewport:window.innerWidth,
             frame:r?Math.round(r.width):null,
             frameLeft:r?Math.round(r.left):null,
             frameRight:r?Math.round(window.innerWidth-r.right):null,
             centred:!!(r && Math.abs(r.left-(window.innerWidth-r.right))<=2),
             rootFont:parseFloat(getComputedStyle(document.documentElement).fontSize),
             checkbox:A, edit:B, intersect:hit(A,B),
             nameIsLink:!!(row && row.querySelector('a.nm')) };
  }
  window.__HT16.metrics = metrics;
  window.__HT16.squareLayout = squareLayout;

  /* ---- S2b · THE WIRING FOLLOWS THE PANELS ----------------------------------------------
     HT-15 delegates its chart clicks from `#vViews`. Moving the two graphs out of it into their own
     grid panels takes them out of that subtree, so the dots go dead — MEASURED, golden_ht15 6 and 7.
     The same four behaviours are re-bound here, on the panels themselves, using the app's own
     navigators: `goDay(k)` for a day, `S.calYM` for a month. No second copy of date state. */
  function bindPanels(){
    ['h16Month','h16Year'].forEach(function(id){
      var n=document.getElementById(id); if(!n || n.dataset.ht16) return;
      n.dataset.ht16='1';
      n.addEventListener('click',function(e){
        var mn=e.target.closest('[data-vgm]');
        if(mn){ var d=+mn.getAttribute('data-vgm');
          var ym=S.calYM||[dnum(today()).getFullYear(),dnum(today()).getMonth()];
          var m=ym[1]+d, y=ym[0];
          if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
          S.calYM=[y,m]; repaint(); return; }
        var yn=e.target.closest('[data-vgyn]');
        if(yn){ S.vYear=(S.vYear||dnum(today()).getFullYear())+(+yn.getAttribute('data-vgyn'));
          repaint(); return; }
        var ym2=e.target.closest('[data-vgy]');
        if(ym2){ S.calYM=[S.vYear||dnum(today()).getFullYear(), +ym2.getAttribute('data-vgy')];
          repaint(); return; }
        var d2=e.target.closest('[data-vgd]');
        if(d2){ var k=d2.getAttribute('data-vgd');
          if(k>today()) return;
          goDay(k);
          if(phone() && window.__HT13_TAB) window.__HT13_TAB('today');
          return; }
      });
      n.addEventListener('pointerover',function(e){
        var h=e.target.closest('[data-tip]'); if(!h) return;
        var svg=h.closest('svg'); if(!svg) return;
        var tip=document.getElementById(svg.id==='vYear'?'vYearTip':'vMonthTip');
        if(tip) tip.textContent=h.getAttribute('data-tip');
      });
    });
    if(!window.__HT16_RESIZE){
      window.__HT16_RESIZE=1;
      var rT=null;
      window.addEventListener('resize',function(){ clearTimeout(rT); rT=setTimeout(repaint,240); });
    }
    var tabs=document.getElementById('vTabs');
    if(tabs && !tabs.dataset.ht16){
      tabs.dataset.ht16='1';
      tabs.addEventListener('click',function(e){
        if(e.target.closest('[data-v]')) setTimeout(repaint,80);
      });
    }
  }

  /* ---- S3 · THE TWO CHARTS (R70.94) -----------------------------------------------------
     Amends R70.69/R70.70. HT-15's painters are local to HT-15's IIFE and unreachable by name from
     here, so this layer owns the final drawing of `#vMonth` and `#vYear` -- the same nodes, the same
     `data-vgd` / `data-vgy` / `circle.hit` / `data-tip` contract, so HT-15's own golden still reads
     true, with HT-16's axes, per-day labels and ramp-coloured dots on top.

     ONE LABEL PER DAY, NEVER THINNED. A thinned axis is why a month chart cannot answer "which
     Tuesday did I drop", which is the only question it is for. The label is one <text> carrying two
     tspans -- the day number over the weekday -- so a per-day count is a count of labels, and at
     28px per day on a phone every one of them survives inside the chart's own scroller. The page
     never scrolls sideways; the chart does. */
  var DOW3=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var PHONE_DAY_PX = 28;

  function monthKeys(y,m){
    var out=[]; for(var i=1;i<=31;i++){ var d=new Date(y,m,i); if(d.getMonth()!==m) break; out.push(dk(d)); }
    return out;
  }
  function tipOf(c,r){
    return (c==null?'\u2014':Math.round(c)+'%')+' \u00b7 '+(r==null?'\u2014':r+'/10');
  }

  function h16Chart(svgId, pts, opts){
    var svg=document.getElementById(svgId); if(!svg) return 0;
    var host=svg.parentNode;
    var H=opts.height||190, L=30, R=34, T=12, B=opts.twoLine?34:24;
    var n=pts.length, W;
    var narrow = opts.perX && window.innerWidth<=480;
    if(narrow){
      W = L + R + n*opts.perX;                               /* a full cell either end, so nothing clips */
      svg.setAttribute('viewBox','0 0 '+W+' '+H);
      svg.setAttribute('preserveAspectRatio','xMinYMin meet');
      svg.setAttribute('width',W); svg.setAttribute('height',H);
      svg.style.width=W+'px'; svg.style.height=H+'px';
      if(host) host.classList.add('h16scroll');
    } else {
      if(host) host.classList.remove('h16scroll');
      svg.removeAttribute('width'); svg.style.width='';
      if(!svg.getClientRects().length) return 0;             /* a hidden surface measures 0 wide */
      W = fitSvg(svgId,H);
    }
    var pad=opts.pad||0;
    var px=function(i){ return n<2 ? L+(W-L-R)/2 : L+pad+i*(W-L-R-2*pad)/(n-1); };
    var py=function(v){ return H-B-(v/100)*(H-T-B); };
    var s='';
    /* LEFT 0-100 in tens, a gridline every ten. RIGHT 1-10 by one, the rating in its own units. */
    for(var v=0; v<=100; v+=10){
      s+='<line class="ax'+(v===0?' ax0':'')+'" x1="'+L+'" y1="'+py(v).toFixed(1)+'" x2="'+(W-R)+
         '" y2="'+py(v).toFixed(1)+'"/>'+
         '<text class="ayl" x="'+(L-5)+'" y="'+(py(v)+3).toFixed(1)+'" text-anchor="end">'+v+'</text>';
      if(v>0) s+='<text class="ax2" x="'+(W-R+5)+'" y="'+(py(v)+3).toFixed(1)+'">'+(v/10)+'</text>';
    }
    function runs(get){
      var out=[], cur=[];
      pts.forEach(function(p,i){ var val=get(p);
        if(val==null){ if(cur.length){ out.push(cur); cur=[]; } return; }
        cur.push([i,val]); });
      if(cur.length) out.push(cur);
      return out;
    }
    function draw(rs,cls){
      return rs.map(function(r){
        if(r.length===1) return '<circle class="'+cls+'-d" cx="'+px(r[0][0]).toFixed(1)+
                                '" cy="'+py(r[0][1]).toFixed(1)+'" r="2"/>';
        return '<path class="'+cls+'" d="'+r.map(function(pt,j){
          return (j?'L':'M')+px(pt[0]).toFixed(1)+' '+py(pt[1]).toFixed(1); }).join(' ')+'"/>';
      }).join('');
    }
    s+=draw(runs(function(p){ return p.c; }),'ln-c');
    s+=draw(runs(function(p){ return p.r==null?null:p.r*10; }),'ln-r');
    /* the dots, each behind a hit area no smaller than 24px: a 6px target on a phone is decoration.
       A COMPLETION DOT IS FILLED WITH THAT DAY'S RAMP COLOUR, so the line and the grade agree. */
    pts.forEach(function(p,i){
      if(p.c==null && p.r==null) return;
      var tip=tipOf(p.c,p.r), at=opts.attr+'="'+p.key+'"';
      if(p.c!=null) s+='<circle class="dot dot-c '+rampClass(p.c)+'" '+at+' data-tip="'+esc(tip)+
                       '" cx="'+px(i).toFixed(1)+'" cy="'+py(p.c).toFixed(1)+'" r="3.1"/>';
      if(p.r!=null) s+='<circle class="dot dot-r" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
                       '" cy="'+py(p.r*10).toFixed(1)+'" r="2.4"/>';
      s+='<circle class="hit" '+at+' data-tip="'+esc(tip)+'" cx="'+px(i).toFixed(1)+
         '" cy="'+(H/2)+'" r="12"/>';
    });
    /* EVERY label, always. Two tspans in ONE <text>, so a per-day count counts days. */
    pts.forEach(function(p,i){
      var x=px(i).toFixed(1);
      s+='<text class="xl" x="'+x+'" y="'+(H-(opts.twoLine?18:8))+'" text-anchor="middle">'+
         '<tspan x="'+x+'">'+esc(p.x)+'</tspan>'+
         (opts.twoLine?'<tspan class="xl2" x="'+x+'" dy="10">'+esc(p.x2||'')+'</tspan>':'')+
         '</text>';
    });
    svg.innerHTML=s;
    return pts.filter(function(p){ return p.c!=null||p.r!=null; }).length;
  }

  function monthPoints(){
    var ym=S.calYM||(S.calYM=[dnum(today()).getFullYear(),dnum(today()).getMonth()]);
    return monthKeys(ym[0],ym[1]).map(function(k,i){
      return { x:String(i+1), x2:DOW3[dnum(k).getDay()], key:k, c:pctOn(k), r:ratingOf(k) };
    });
  }
  function yearPoints(){
    var yr=S.vYear||(S.vYear=dnum(today()).getFullYear()), out=[];
    for(var m=0;m<12;m++){
      var ks=monthKeys(yr,m);
      var cs=ks.map(pctOn).filter(function(v){ return v!=null; });
      var rs=ks.map(ratingOf).filter(function(v){ return v!=null; });
      /* 0 LOGGED DAYS IS A GAP, NOT A ZERO. A zero reads as a month of total failure. */
      out.push({ x:MO[m][0], x2:'', key:String(m),
                 c: cs.length? Math.round(meanOf(cs)) : null,
                 r: rs.length? Math.round(meanOf(rs)*10)/10 : null });
    }
    return out;
  }

  function paintMonth16(){
    var pts=monthPoints();
    h16Chart('vMonth', pts, { attr:'data-vgd', height:196, twoLine:true, pad:4, perX:PHONE_DAY_PX });
    var ym=S.calYM, nav=document.getElementById('vMonthNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgm="-1">\u2039</button>'+
      '<b>'+MO[ym[1]].toUpperCase()+' '+ym[0]+'</b>'+
      '<button class="mv" data-vgm="1">\u203a</button>'+legend();
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vMonthTip');
    if(tip) tip.textContent = got? got+' logged' : 'nothing logged';
    return pts;
  }
  function paintYear16(){
    var pts=yearPoints();
    h16Chart('vYear', pts, { attr:'data-vgy', height:196, twoLine:false, pad:2 });
    var nav=document.getElementById('vYearNav');
    if(nav) nav.innerHTML='<button class="mv" data-vgyn="-1">\u2039</button>'+
      '<b>'+(S.vYear||dnum(today()).getFullYear())+'</b>'+
      '<button class="mv" data-vgyn="1">\u203a</button>'+legend();
    var got=pts.filter(function(p){ return p.c!=null; }).length;
    var tip=document.getElementById('vYearTip');
    if(tip) tip.textContent=got+' of 12 months logged';
    return pts;
  }
  window.__HT16.monthPoints = monthPoints;
  window.__HT16.yearPoints  = yearPoints;
  window.__HT16.tipOf       = tipOf;

  /* ---- S4 · LIFE IN WEEKS (R70.95 · R70.96) ---------------------------------------------
     TARGET AGE IS A CONSTANT: 100, for everyone. The setting leaves the simple view in S8; the
     stored value is untouched (R70.79 -- code retires via git, data never).

     THE ITEM-8 BUG, and what it was. The week index was measured from the MONDAY of the birth week
     and the lived run was drawn row by row against that -- but the ground rect for every row was
     painted first at 45% and the lived run only covered the rows it reached, so a life that has been
     lived for 1,900 weeks read as a handful of coloured squares in an empty field. LIVED is now an
     explicit fill of every week from 0 through today's index, --grey at 60%, and the golden counts
     the filled cells against `todayWeek + 1`.

     Week index is `floor((date - birthdate) / 7 days)`; week 0 IS the birth week -- anchored on the
     birthdate itself, not on a Monday, because "your 1,000th week" is measured from the day you were
     born and off-by-a-Monday is a whole week of someone's life.

     ~5,200 cells. Drawn as HT-13 learned to: one run per lived year plus one <pattern> of gap lines
     laid over the finished drawing, which restores every cell edge for two nodes. A run alone has no
     edges and renders as solid stripes -- that is exactly how the last life graph came out. */
  function weekIndex(k, b){
    if(!b) return null;
    var d = (typeof k==='string') ? dnum(k) : k;
    return Math.floor((d - b) / MSWEEK);
  }
  function loggedWeeks(b){
    var by={};
    dates().forEach(function(k){
      var v=pctOn(k); if(v==null) return;
      var wi=weekIndex(k,b); if(wi==null||wi<0) return;
      (by[wi]=by[wi]||[]).push(v);
    });
    return by;
  }
  function lifeFacts(){
    var b=birth();
    if(!b) return { birth:null };
    var now=weekIndex(new Date(), b);
    var by=loggedWeeks(b);
    var keys=Object.keys(by).map(Number).sort(function(x,y){ return x-y; });
    var means={}; keys.forEach(function(i){ means[i]=meanOf(by[i]); });
    var best=null;
    keys.forEach(function(i){ if(best==null||means[i]>means[best]) best=i; });
    /* the logging streak: consecutive weeks with at least one logged day, ending at the most
       recent logged week. A gap ends it; it is not forgiving, and it does not need to be. */
    var streak=0;
    if(keys.length){
      var w=keys[keys.length-1]; streak=1;
      while(by[w-1]!=null){ streak++; w--; }
    }
    var yr=new Date().getFullYear();
    var yrKeys=keys.filter(function(i){
      var d=new Date(b.getTime()+i*MSWEEK); return d.getFullYear()===yr; });
    return {
      birth: dk(b), week: now, total: LIFE_TOTAL,
      pctLived: Math.round(now/LIFE_TOTAL*1000)/10,
      left: Math.max(0, LIFE_TOTAL-now),
      loggedWeeks: keys.length,
      meanPct: keys.length? Math.round(meanOf(keys.map(function(i){ return means[i]; }))) : null,
      bestWeek: best, bestPct: best==null?null:Math.round(means[best]),
      streak: streak,
      yearLogged: yrKeys.length,
      yearMean: yrKeys.length? Math.round(meanOf(yrKeys.map(function(i){ return means[i]; }))) : null,
      thousandAge: (function(){
        if(keys.length>=1000) return null;
        if(!streak) return null;
        return Math.floor((now + (1000-keys.length))/52.1775);
      })()
    };
  }

  function paintInsights16(){
    var host=document.getElementById('h16InsBody'); if(!host) return;
    var cap=document.getElementById('h16InsC');
    var f=lifeFacts();
    if(!f.birth){
      host.innerHTML='<div class="h16ins">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent='';
      return;
    }
    var n=function(x){ return x==null?'\u2014':x.toLocaleString(); };
    host.innerHTML=
      '<div class="h16ins">Week '+n(f.week)+' of '+n(f.total)+' \u00b7 '+f.pctLived+' % lived \u00b7 '+
        n(f.left)+' weeks left \u00b7 '+n(f.loggedWeeks)+' weeks logged \u00b7 mean '+
        (f.meanPct==null?'\u2014':f.meanPct)+' % \u00b7 best week W'+
        (f.bestWeek==null?'\u2014':f.bestWeek)+' ('+(f.bestPct==null?'\u2014':f.bestPct)+' %)'+
        ' \u00b7 logging streak '+f.streak+' wks</div>'+
      '<div class="h16ins h16ins2">this year: '+f.yearLogged+' of 52 logged \u00b7 mean '+
        (f.yearMean==null?'\u2014':f.yearMean)+' % \u00b7 '+
        (f.thousandAge==null
          ? 'a logging streak is what projects the 1,000th logged week; there is not one yet'
          : 'at your streak you reach 1,000 logged weeks at age '+f.thousandAge)+'</div>';
    if(cap) cap.innerHTML=legend();
  }

  function paintWeeks16(){
    var host=document.getElementById('vWeeks'); if(!host) return;
    var cap=document.getElementById('vWeeksC');
    var b=birth(), GAP=1, cols=LIFE_COLS, rows=LIFE_ROWS;

    if(!b){
      /* IT DOES NOT GUESS: the weeks it has, and one line saying what is missing. No number. */
      var wk={}, C=9;
      dates().forEach(function(k){ var v=pctOn(k); if(v==null) return;
        var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7));
        (wk[dk(d)]=wk[dk(d)]||[]).push(v); });
      var keys=Object.keys(wk).sort();
      var W0=Math.max(1,keys.length)*(C+GAP);
      host.innerHTML='<div class="wkscroll"><svg class="wkg" width="'+W0+'" height="'+(C+GAP)+
        '" viewBox="0 0 '+W0+' '+(C+GAP)+'">'+
        keys.map(function(m,i){
          return '<rect class="lw" x="'+(i*(C+GAP))+'" y="0" width="'+C+'" height="'+C+'" fill="'+
                 rampFill(meanOf(wk[m]))+'"/>'; }).join('')+'</svg></div>'+
        '<div class="vempty">Add your birthdate in Settings to see the whole life.</div>';
      if(cap) cap.textContent='the weeks you have logged';
      return;
    }

    var nowWeek=weekIndex(new Date(), b);
    var by=loggedWeeks(b);
    var LEFT=26, TOP=16;
    var cell = phone()? 9 : 12;
    var P=cell+GAP;
    var W=LEFT+cols*P, H=TOP+rows*P;
    var s='<text class="wl" x="'+LEFT+'" y="'+(TOP-5)+'">weeks \u2192</text>';
    var lived=0;
    for(var r=0;r<rows;r++){
      var yy=TOP+r*P;
      /* the future: --surface, never a ramp colour */
      s+='<rect x="'+LEFT+'" y="'+yy+'" width="'+(cols*P-GAP)+'" height="'+cell+
         '" fill="var(--surface)"/>';
      var start=r*cols, end=start+cols-1;
      var livedTo=Math.min(end, nowWeek);
      if(livedTo>=start){
        var count=livedTo-start+1;
        lived+=count;
        s+='<rect class="lv" x="'+LEFT+'" y="'+yy+'" width="'+(count*P-GAP)+'" height="'+cell+
           '" fill="var(--grey)" opacity=".6"/>';
      }
      if(r%10===0)
        s+='<text class="wl" x="'+(LEFT-5)+'" y="'+(yy+cell)+'" text-anchor="end">'+r+'</text>';
    }
    /* the logged weeks, each in its own cell, carrying that week's mean completion on the ramp */
    Object.keys(by).forEach(function(wi){
      var i=+wi, rr=Math.floor(i/cols), cc=i%cols;
      if(rr>=rows) return;
      s+='<rect class="lw" x="'+(LEFT+cc*P)+'" y="'+(TOP+rr*P)+'" width="'+cell+'" height="'+cell+
         '" fill="'+rampFill(meanOf(by[i]))+'"/>';
    });
    var pat='<defs><pattern id="wkcell" width="'+P+'" height="'+P+'" patternUnits="userSpaceOnUse">'+
      '<rect x="'+cell+'" y="0" width="'+GAP+'" height="'+P+'" fill="var(--bg)"/>'+
      '<rect x="0" y="'+cell+'" width="'+P+'" height="'+GAP+'" fill="var(--bg)"/></pattern></defs>';
    var cur='';
    var cr=Math.floor(nowWeek/cols), cc2=nowWeek%cols;
    if(cr<rows) cur='<rect class="cw" x="'+(LEFT+cc2*P-0.5)+'" y="'+(TOP+cr*P-0.5)+'" width="'+
      (cell+1)+'" height="'+(cell+1)+'" fill="none" stroke="var(--outline-today)" stroke-width="1.5"/>';

    host.innerHTML='<div class="wkscroll'+(phone()?'':' natural')+'">'+
      '<svg class="wkg" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'">'+
      pat+s+'<rect x="'+LEFT+'" y="'+TOP+'" width="'+(cols*P)+'" height="'+(rows*P)+
      '" fill="url(#wkcell)" pointer-events="none"/>'+cur+'</svg></div>';

    var loggedDays=dates().filter(function(k){ return pctOn(k)!=null; }).length;
    if(cap) cap.textContent='Week '+nowWeek.toLocaleString()+' of '+LIFE_TOTAL.toLocaleString()+
      ' \u00b7 '+Math.max(0,LIFE_TOTAL-nowWeek).toLocaleString()+' weeks left at '+TARGET_AGE+
      ' \u00b7 '+loggedDays+' days logged';

    /* the current week centred in the phone scroller: at column '+cc2+' of 52 it opens off screen */
    var sc=host.querySelector('.wkscroll');
    if(sc && sc.scrollWidth>sc.clientWidth) sc.scrollLeft=Math.max(0,(LEFT+cc2*P)-sc.clientWidth/2);
    return { lived:lived, nowWeek:nowWeek };
  }
  window.__HT16.weekIndex  = weekIndex;
  window.__HT16.lifeFacts  = lifeFacts;
  window.__HT16.paintWeeks = paintWeeks16;

  /* ---- S5 · THE SCORECARD (R70.97) ------------------------------------------------------
     PASTE 42 C1 is answered: keep, rebuilt. The bars said one number per group and nothing about
     whether it was moving, which habit was carrying the loss, or how long the run was -- so the
     bars are replaced, worst first, and the old renderer is deleted in this same commit (R70.79,
     DEC-096: a named replacement, landing together).

     THE DEFINITION, and it ships with the table (Settings -> About): of all the habit check-offs
     that were SCHEDULED in a group over the last 30 days, the share you actually completed.
     100% = every scheduled habit in that group done every scheduled day. A weekly standard is ONE
     opportunity per week, not per day -- counting it daily divides by seven and reads as failure. */
  function groupsOf(){
    var out=[], seen={};
    S.habits.forEach(function(h){
      var g=h.group_name||'Other';
      if(!seen[g]){ seen[g]=1; out.push(g); }
    });
    return out;
  }
  /* hits and opportunities for one group over the window [from, to] in day-offsets back from today */
  function adherenceWindow(group, back0, back1){
    var byId={}; S.habits.forEach(function(h){ byId[h.id]=h; });
    var hit=0, opp=0, seenWeek={};
    for(var i=back0;i<=back1;i++){
      var k=shift(today(),-i);
      var r=S.byDate[k]; if(!r||!loggedOn(k)) continue;
      var set=r.active_set||Object.keys(byId);
      var ck=r.checked||{};
      set.forEach(function(hid){
        var h=byId[hid]; if(!h) return;
        if((h.group_name||'Other')!==group) return;
        if(h.cadence==='weekly'){
          var d=dnum(k); d.setDate(d.getDate()-((d.getDay()+6)%7));
          var wk=dk(d); if(seenWeek[hid+'|'+wk]) return;
          seenWeek[hid+'|'+wk]=1; opp++;
          if(weekDone(hid,k)) hit++;
          return;
        }
        opp++; if(ck[hid]) hit++;
      });
    }
    return { hit:hit, opp:opp, pct: opp? Math.round(hit/opp*100) : null };
  }
  /* consecutive days on which EVERY standard scheduled in the group was done */
  function groupStreak(group){
    var byId={}; S.habits.forEach(function(h){ byId[h.id]=h; });
    var n=0, k=today(), guard=0;
    if(!loggedOn(k)) k=shift(k,-1);
    while(guard++<400){
      var r=S.byDate[k]; if(!r||!loggedOn(k)) break;
      var set=r.active_set||Object.keys(byId), ck=r.checked||{}, any=false, all=true;
      set.forEach(function(hid){
        var h=byId[hid]; if(!h||(h.group_name||'Other')!==group) return;
        any=true;
        var done = h.cadence==='weekly' ? weekDone(hid,k) : !!ck[hid];
        if(!done) all=false;
      });
      if(!any || !all) break;
      n++; k=shift(k,-1);
    }
    return n;
  }
  function weakestIn(group){
    var out=null;
    S.habits.forEach(function(h){
      if((h.group_name||'Other')!==group) return;
      var a=adherence30(h.id); if(a==null) return;
      if(out==null || a<out.pct) out={ name:label(h.name), pct:a };
    });
    return out;
  }
  /* twelve weekly figures, oldest first; a week with no opportunity is a gap, not a zero */
  function weeklyAdherence(group){
    var out=[];
    for(var w=11;w>=0;w--) out.push(adherenceWindow(group, w*7, w*7+6).pct);
    return out;
  }
  function sparkSvg(vals){
    var W=84, H=20, n=vals.length;
    var px=function(i){ return n<2?W/2:1+i*(W-2)/(n-1); };
    var py=function(v){ return H-2-(v/100)*(H-5); };
    var runs=[], cur=[];
    vals.forEach(function(v,i){ if(v==null){ if(cur.length){runs.push(cur);cur=[];} return; } cur.push([i,v]); });
    if(cur.length) runs.push(cur);
    var s='';
    runs.forEach(function(r){
      if(r.length===1) s+='<circle class="sp1" cx="'+px(r[0][0]).toFixed(1)+'" cy="'+py(r[0][1]).toFixed(1)+'" r="1.4"/>';
      else s+='<path class="spl" d="'+r.map(function(pt,j){
        return (j?'L':'M')+px(pt[0]).toFixed(1)+' '+py(pt[1]).toFixed(1); }).join(' ')+'"/>';
    });
    var last=null, li=-1;
    for(var i=vals.length-1;i>=0;i--){ if(vals[i]!=null){ last=vals[i]; li=i; break; } }
    if(last!=null) s+='<circle class="spd '+rampClass(last)+'" cx="'+px(li).toFixed(1)+'" cy="'+
      py(last).toFixed(1)+'" r="2.2"/>';
    return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'">'+s+'</svg>';
  }

  function scorecardRows(){
    return groupsOf().map(function(g){
      var cur=adherenceWindow(g,0,29), prv=adherenceWindow(g,30,59);
      var wk=weakestIn(g);
      return { group:g, pct:cur.pct, hit:cur.hit, opp:cur.opp,
               prev:prv.pct,
               delta:(cur.pct==null||prv.pct==null)?null:(cur.pct-prv.pct),
               streak:groupStreak(g), weakest:wk,
               spark:weeklyAdherence(g),
               onTime:(typeof onTime30==='function'? onTime30(g) : null) };
    }).sort(function(a,b){
      var x=a.pct==null?101:a.pct, y=b.pct==null?101:b.pct;
      return x-y || (a.group<b.group?-1:1);
    });
  }

  function paintScorecard(){
    var host=document.getElementById('vGroups'); if(!host) return;
    var rows=scorecardRows();
    var cap=document.getElementById('vGroupsC');
    if(cap) cap.textContent='last 30 days \u00b7 worst first';
    if(!rows.length){ host.innerHTML='<div class="vempty">No active standards yet.</div>'; return; }
    host.innerHTML=
      '<table class="h16sc"><thead><tr>'+
        '<th>Group</th><th class="r">30d</th><th class="r">\u0394</th><th class="r">Streak</th>'+
        '<th>Weakest</th><th>12 weeks</th><th class="r">On time</th>'+
      '</tr></thead><tbody>'+
      rows.map(function(r){
        var d=r.delta;
        return '<tr>'+
          '<td class="g">'+esc(r.group)+'</td>'+
          '<td class="r num '+rampClass(r.pct)+'">'+(r.pct==null?'\u2014':r.pct+'%')+'</td>'+
          '<td class="r num dl">'+(d==null?'\u2014':(d>0?'\u25b2':(d<0?'\u25bc':'\u00b7'))+
            (d===0?'':Math.abs(d)))+'</td>'+
          '<td class="r num">'+r.streak+'</td>'+
          '<td class="wk">'+(r.weakest? esc(r.weakest.name)+' <s>'+r.weakest.pct+'%</s>' : '\u2014')+'</td>'+
          '<td>'+sparkSvg(r.spark)+'</td>'+
          '<td class="r num">'+(r.onTime==null?'\u2014':r.onTime+'%')+'</td>'+
        '</tr>'; }).join('')+
      '</tbody></table>';
  }

  /* the definition ships with the table (R70.97), in Cory's words */
  var ADHERENCE_DEF =
    'Group adherence \u2014 of all the habit check-offs that were scheduled in a group over the last ' +
    '30 days, the share you actually completed. 100 % = every scheduled habit in that group done ' +
    'every scheduled day.';
  function aboutScorecard(){
    var a=document.getElementById('vAbout'); if(!a || a.dataset.ht16) return;
    a.dataset.ht16='1';
    var d=document.createElement('div');
    d.id='h16About'; d.style.paddingTop='6px';
    d.innerHTML='<b>The scorecard</b> \u2014 '+ADHERENCE_DEF;
    a.appendChild(d);
  }
  window.__HT16.scorecardRows    = scorecardRows;
  window.__HT16.adherenceWindow  = adherenceWindow;
  window.__HT16.groupStreak      = groupStreak;
  window.__HT16.ADHERENCE_DEF    = ADHERENCE_DEF;

  /* ---- S6 · TASK TIME (R70.103) — absorbs HT-12 TIME entirely ---------------------------
     Two optional fields per standard: `time_anchor` (when in the day) and `minutes_planned` (how
     long). Both are additive columns with their own probe, so this build runs before and after the
     migration; before it, TODAY keeps the order it has and nothing on the row changes.

     NO TIMER, AND NO SECOND CALENDAR. ClickUp stays the system of record for committed time; HT
     holds the habit's slot only. ACTUAL is the day's existing `closed_at` (HT-13 G2) — the only
     completion timestamp this app has ever written, and inventing a second one would mean two
     answers to "when did you finish".

     Cory's 9/6 "no time next to tasks" is superseded by his 9/7 R70.103 prefix. Said here so a
     later wire does not read the older ruling and strip it back out. */
  function anchorOf(h){ return hhmm(h && h.time_anchor); }
  function planOf(h){
    if(!h) return null;
    if(h.minutes_planned!=null && h.minutes_planned!=='') return +h.minutes_planned;
    return h.minutes? +h.minutes : null;      /* the price stands in until a slot length is set */
  }
  function anchorMin(h){ return minsOf(h && h.time_anchor); }
  function endMin(h){
    var a=anchorMin(h); if(a==null) return null;
    return a + (planOf(h)||0);
  }
  function timedHabits(){ return S.habits.filter(function(h){ return anchorMin(h)!=null; }); }

  /* TODAY SORTS BY ANCHOR; everything unanchored falls to an ANYTIME block at the bottom in the
     order it already had. Only when at least one standard carries an anchor -- otherwise the list
     Cory has today must not move under him. */
  function sortToday(list){
    var timed=[], any=[];
    list.forEach(function(h){ (anchorMin(h)==null?any:timed).push(h); });
    if(!timed.length) return { timed:[], any:list, split:false };
    timed.sort(function(a,b){
      return anchorMin(a)-anchorMin(b) || (a.sort_order||0)-(b.sort_order||0); });
    return { timed:timed, any:any, split:true };
  }

  /* the day load: planned, done (planned minutes of what is checked) and what is left */
  function loadSums(k){
    var day=k||S.date, ck=ckOf(day), planned=0, done=0;
    S.habits.forEach(function(h){
      if(h.cadence==='weekly') return;
      var m=planOf(h); if(m==null) return;
      planned+=m; if(ck[h.id]) done+=m;
    });
    return { planned:planned, done:done, left:Math.max(0,planned-done) };
  }

  /* the day's close time, in minutes past local midnight; null when the day was never closed */
  function closeMin(k){
    var r=S.byDate[k]; var c=r&&r.closed_at; if(!c) return null;
    var d=new Date(c); if(isNaN(d)) return null;
    return d.getHours()*60+d.getMinutes();
  }
  /* ON TIME = a timed standard, checked, on a day whose close is at or before anchor + minutes.
     A day that was never closed carries no answer and is not counted either way. */
  function onTimeOn(k, filter){
    var r=S.byDate[k]; if(!r||!loggedOn(k)) return null;
    var cm=closeMin(k); if(cm==null) return null;
    var ck=r.checked||{}, n=0, ok=0;
    timedHabits().forEach(function(h){
      if(filter && !filter(h)) return;
      if(h.cadence==='weekly'? !weekDone(h.id,k) : !ck[h.id]) return;
      n++; if(cm<=endMin(h)) ok++;
    });
    return n? { n:n, ok:ok, pct:Math.round(ok/n*100) } : null;
  }
  function onTime30(group){
    var n=0, ok=0;
    for(var i=0;i<30;i++){
      var r=onTimeOn(shift(today(),-i), group? function(h){
        return (h.group_name||'Other')===group; } : null);
      if(!r) continue; n+=r.n; ok+=r.ok;
    }
    return n? Math.round(ok/n*100) : null;
  }
  /* THE LEARNING: the median close time of a standard's last 30 check-offs, as HH:MM. It is a
     SUGGESTION and nothing writes it -- one tap in the editor adopts it (R70.103). */
  function medianClose(hid){
    var h=S.habits.filter(function(x){ return x.id===hid; })[0];
    var vals=[], k=today(), guard=0;
    while(guard++<400 && vals.length<30){
      var r=S.byDate[k];
      if(r && loggedOn(k) && (r.checked||{})[hid]){
        var cm=closeMin(k); if(cm!=null) vals.push(cm);
      }
      k=shift(k,-1);
    }
    if(vals.length<3) return null;               /* three points is the floor for a median to mean anything */
    vals.sort(function(a,b){ return a-b; });
    var mid=Math.floor(vals.length/2);
    var m=vals.length%2? vals[mid] : Math.round((vals[mid-1]+vals[mid])/2);
    return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);
  }

  /* ---- the row prefix, the overdue tint, the ANYTIME block and the load line ---- */
  function nowMin(){ var d=new Date(); return d.getHours()*60+d.getMinutes(); }

  function decorateTime(){
    var log=document.getElementById('log'); if(!log) return;
    var rows=q('.li',log);
    if(!rows.length) return;
    var ck=ckOf(S.date), isToday=(S.date===today());
    var anySplit=false;

    rows.forEach(function(row){
      var h=S.habits.filter(function(x){ return x.id===row.getAttribute('data-h'); })[0];
      if(!h) return;
      var a=anchorOf(h), pm=planOf(h);
      var old=row.querySelector('.tpfx');
      if(a){
        anySplit=true;
        var txt=a+(pm?' \u00b7 '+pm+'m':'');
        if(old) old.textContent=txt;
        else{
          var sp=document.createElement('span');
          sp.className='tpfx'; sp.textContent=txt;
          var bx=row.querySelector('.bxw');
          row.insertBefore(sp, bx? bx.nextSibling : row.firstChild);
        }
      } else if(old){ old.parentNode.removeChild(old); }
      /* OVERDUE: the slot has passed and the box is not ticked. The ONLY red on a task row. */
      var over = isToday && a!=null && !ck[h.id] && h.cadence!=='weekly' && nowMin() > endMin(h);
      row.classList.toggle('h16-over', !!over);
    });

    if(anySplit) reorderToday(log);
    loadLine();
  }

  function reorderToday(log){
    var order=sortToday(S.habits.slice());
    if(!order.split) return;
    var byId={}; q('.li',log).forEach(function(r){ byId[r.getAttribute('data-h')]=r; });
    var frag=document.createDocumentFragment();
    order.timed.forEach(function(h){ if(byId[h.id]) frag.appendChild(byId[h.id]); });
    var anyRows=order.any.filter(function(h){ return byId[h.id]; });
    if(anyRows.length){
      var hd=document.createElement('div');
      hd.className='grp h16any'; hd.textContent='ANYTIME';
      frag.appendChild(hd);
      anyRows.forEach(function(h){ frag.appendChild(byId[h.id]); });
    }
    /* the group headers go: with anchors the anchor IS the order, and two orderings in one list is
       two answers to "what is next". HT-11's "+ Add standard" is a control, not an ordering, so one
       of them is carried to the foot rather than dropped. */
    var add=log.querySelector('.eadd');
    if(add){ add.setAttribute('data-add',''); add.textContent='+ Add standard'; frag.appendChild(add); }
    log.innerHTML='';
    log.appendChild(frag);
  }

  function loadLine(){
    var log=document.getElementById('log'); if(!log) return;
    var n=document.getElementById('h16Load');
    if(!n){
      n=document.createElement('div'); n.id='h16Load'; n.className='h16load';
      log.parentNode.insertBefore(n, log);
    }
    var L=loadSums(S.date);
    if(!L.planned){ n.textContent=''; n.classList.add('h16off'); return; }
    n.classList.remove('h16off');
    var ot=onTimeOn(S.date);
    n.textContent='Planned '+fmtHM(L.planned)+' \u00b7 Done '+fmtHM(L.done)+
      ' \u00b7 Left '+fmtHM(L.left)+
      (ot? ' \u00b7 On time '+ot.pct+'%' : (timedHabits().length? ' \u00b7 On time \u2014' : ''));
  }

  /* the DATA SEAM (R70.102). Every acceptance in this wire is a data golden, and `S` lives inside
     the sealed closure where no test can reach it. This exposes a READ-ONLY projection of exactly
     what the goldens assert against -- nothing here writes. */
  window.__HT16.state = function(){
    return { hasTime:!!S.hasTime, date:S.date, today:today(),
             habits:S.habits.map(function(h){
               return { id:h.id, name:label(h.name), group:h.group_name||'Other',
                        cadence:h.cadence||'daily', minutes:h.minutes||0,
                        time_anchor:h.time_anchor==null?null:h.time_anchor,
                        minutes_planned:h.minutes_planned==null?null:h.minutes_planned,
                        link:h.link||null, plan:planOf(h), endMin:endMin(h) }; }),
             days:dates().map(function(k){ var r=S.byDate[k];
               return { date:k, pct:r.pct, closed_at:r.closed_at||null,
                        checked:Object.keys(r.checked||{}) }; }) };
  };
  window.__HT16.sortToday   = function(){ return sortToday(S.habits.slice()); };
  window.__HT16.loadSums    = loadSums;
  window.__HT16.onTimeOn    = onTimeOn;
  window.__HT16.onTime30    = onTime30;
  window.__HT16.medianClose = medianClose;
  window.__HT16.planOf      = planOf;
  window.__HT16.endMin      = endMin;

  /* ---- S8 · THE TARGET-AGE SETTING GOES BEHIND ADVANCED (R70.16 — hidden, never deleted) ----
     S4 made the horizon a constant 100 for everyone, so the control is no longer a question the
     simple view asks. The FIELD stays in the DOM and the STORED VALUE is untouched; only the
     control leaves the simple view, and Settings -> Advanced brings it straight back. */
  function tuckTargetAge(){
    var t=document.getElementById('pTarget'); if(!t) return;
    var f=t.closest('.fld'); if(!f || f.dataset.ht16) return;
    f.dataset.ht16='1';
    f.classList.add('h16-adv');
    /* the "needs one migration" note that HT-13 parks next to it goes with it, or the panel keeps
       a sentence about a control nobody can see */
    var n=f.nextElementSibling;
    while(n){
      if(n.classList && n.classList.contains('note') &&
         /target age/i.test(n.textContent||'')){ n.classList.add('h16-adv'); break; }
      n=n.nextElementSibling;
    }
  }
  window.__HT16.tuckTargetAge = tuckTargetAge;

  /* HT16-INSERT */

  function repaint(){
    if(advanced()) return;
    if(!squareLayout()) return;
    bindPanels();
    decorateTime();
    paintMonth16(); paintYear16(); paintWeeks16(); paintInsights16(); paintScorecard();
  }
  function boot(){
    if(advanced()) return;
    if(!S.me) return;
    repaint();
  }
  window.__HT16.repaint = repaint;

  var _pa=paintAll; paintAll=function(){ _pa.apply(null,arguments); boot(); };
  var _pl=paintLog; paintLog=function(){ _pl.apply(null,arguments);
                                         if(!advanced() && S.me) decorateTime(); };
  /* goDay does NOT go through paintLog: HT-9a wraps it and calls its own group() directly, so a day
     change rebuilt the list in group order and the anchor order was lost. MEASURED. */
  var _gd=goDay;    goDay=function(k){ _gd.call(null,k);
                                       if(!advanced() && S.me){ decorateTime(); repaint(); } };
  var _os=openSettings; openSettings=function(){ _os.apply(null,arguments);
                                                 setTimeout(function(){ aboutScorecard();
                                                                        tuckTargetAge(); },180); };
  if(document.readyState==='complete') setTimeout(boot,300);
  else window.addEventListener('load',function(){ setTimeout(boot,300); });
})();

})();
