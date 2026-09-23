const C='ht-v39';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(u.origin!==location.origin) return;
  /* HT-31 S0.3: version.json is the one file a cache may never answer for - it is how the running
     build learns it is behind. Straight to the network, never stored. */
  if(u.pathname.endsWith('/version.json')){ e.respondWith(fetch(r,{cache:'no-store'})); return; }
  e.respondWith(
    fetch(r,{cache:'no-cache'}).then(res=>{
      if(res&&res.status===200){const c=res.clone();caches.open(C).then(k=>k.put(r,c));}
      return res;
    }).catch(()=>caches.match(r))
  );
});
/* HT-29 S9 (PASTE 133) · the evening nudge. Numbers only ("12 of 21 · Andrew 9 of 18 · rate the day") - a nudge never
   carries a journal word. Nothing arrives until a person turns Nudges on AND the sender is armed (R70.344). */
self.addEventListener('push',e=>{
  let d={};
  try{ d=e.data?e.data.json():{}; }catch(x){ d={body:e.data?e.data.text():''}; }
  e.waitUntil(self.registration.showNotification(d.title||'Habit Tracker',{
    body:d.body||'', icon:'./icon-192.png', badge:'./icon-192.png', tag:'ht-nudge', renotify:true, data:{url:d.url||'./'}
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){ if('focus' in w) return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
/* HT-30 S0.3 (PASTE 137): the page asks the WAITING worker what it is, so the banner can name the
   build it is offering instead of asking for blind faith. One message, no state, no fetch. */
self.addEventListener('message', e => {
  const p = e.ports && e.ports[0];
  if(e.data && e.data.type === 'version' && p) p.postMessage({ version: C });
});
