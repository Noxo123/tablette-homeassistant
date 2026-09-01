const CFG = window.HA_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let ws, msgId=1, states={};

function haUrl(path=''){ return `${String(CFG.url||'').replace(/\/$/,'')}${path}`; }
function setConnection(ok,text=ok?'Connecté':'Hors ligne'){ $('#connectionDot').className=`dot ${ok?'online':'offline'}`; $('#connectionText').textContent=text; }
function send(type,payload={}){ if(!ws || ws.readyState!==1) return; ws.send(JSON.stringify({id:msgId++,type,...payload})); }

function connect(){
  if(!CFG.url || !CFG.token || CFG.token.includes('COLLE_')) return setConnection(false,'Configure config.js');
  try { ws = new WebSocket(CFG.url.replace(/^http/,'ws').replace(/\/$/,'')+'/api/websocket'); } catch(e){ return setConnection(false); }
  ws.onopen=()=>setConnection(true);
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==='auth_required') ws.send(JSON.stringify({type:'auth',access_token:CFG.token}));
    if(m.type==='auth_ok'){ setConnection(true); send('subscribe_events',{event_type:'state_changed'}); send('get_states'); }
    if(m.type==='result' && m.success && Array.isArray(m.result)){ m.result.forEach(x=>states[x.entity_id]=x); renderAll(); }
    if(m.type==='event' && m.event?.event_type==='state_changed'){ const n=m.event.data?.new_state; if(n) states[n.entity_id]=n; renderAll(); }
  };
  ws.onclose=()=>{setConnection(false,'Déconnecté'); setTimeout(connect,4000)};
  ws.onerror=()=>setConnection(false,'Erreur');
}
function st(id){return states[id]||null}
function val(id, fallback='—'){const s=st(id); return s?.state ?? fallback}
function attrs(id){return st(id)?.attributes||{}}
function call(domain,service,data){send('call_service',{domain,service,service_data:data});}

function renderAll(){ renderProfiles(); renderWidgets(); renderVehicle(); $('#lastSync').textContent='Synchro '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); }
function renderProfiles(){
  const p=CFG.entities?.profiles||{};
  $('#profiles').innerHTML=[['nolhan','Nolhan'],['lisea','Lisea']].map(([key,name])=>{
    const cfg=p[key]||{}, s=st(cfg.entity), a=attrs(cfg.entity), battery=val(cfg.battery,'—'), state=s?.state||'unknown';
    const picture=a.entity_picture || a.image || '';
    const src=picture ? (picture.startsWith('http')?picture:haUrl(picture)) : `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;
    const cls=state==='home'?'':'away';
    return `<article class="profile"><img class="avatar" src="${esc(src)}" alt="${esc(name)}"><span class="presence ${cls}"></span><div><div class="profile-name">${esc(name)}</div><div class="profile-state">${esc(state)}</div><div class="battery">▰ ${esc(battery)}% · ${esc(s?.last_changed?new Date(s.last_changed).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'—')}</div></div></article>`;
  }).join('');
}
function lightCard(id){const s=st(id), a=attrs(id), on=s?.state==='on', name=a.friendly_name||id.split('.').pop(); return `<button class="control ${on?'on':''}" data-light="${esc(id)}"><div class="control-row"><span>💡 ${esc(name)}</span><b>${on?'ON':'OFF'}</b></div></button>`}
function renderWidgets(){
  const e=CFG.entities||{}, w=$('#widgets');
  const weather=e.weather, wa=attrs(weather), ws=st(weather), media=e.media, ma=attrs(media);
  const lights=(e.lights||[]).slice(0,6).map(lightCard).join('')||'<span class="muted">Configure des lumières dans config.js</span>';
  const temp=val(e.environment?.temperature), hum=val(e.environment?.humidity), air=val(e.environment?.air);
  w.innerHTML=`
  <article class="widget wide glass"><div class="widget-title"><strong>💡 Éclairages</strong><span class="muted">Toucher pour basculer</span></div><div class="light-list">${lights}</div></article>
  <article class="widget glass"><div class="widget-title"><strong>☁️ Météo</strong><span class="muted">${esc(wa.friendly_name||'Maison')}</span></div><div class="weather-now"><div class="weather-icon">${weatherIcon(ws?.state)}</div><div><div class="temp">${esc(wa.temperature??'—')}°</div><div class="muted">${esc(ws?.state||'—')}</div></div></div><div class="forecast">${[1,2,3].map((_,i)=>`<div>J+${i+1}<br>☁️<br><b>—°</b></div>`).join('')}</div></article>
  <article class="widget glass"><div class="widget-title"><strong>🌡️ Air</strong><span class="muted">Maison</span></div><div class="telemetry"><div class="metric"><b>${esc(temp)}°</b><span>TEMP.</span></div><div class="metric"><b>${esc(hum)}%</b><span>HUMIDITÉ</span></div><div class="metric"><b>${esc(air)}</b><span>AIR</span></div><div class="metric"><b>✓</b><span>OK</span></div></div></article>
  <article class="widget wide glass"><div class="widget-title"><strong>🎵 Multimédia</strong><span class="muted">${esc(ma?.state||'—')}</span></div><div class="media"><div class="album">♫</div><div><b>${esc(ma.media_title||'Aucune lecture')}</b><div class="muted">${esc(ma.media_artist||'—')}</div><div class="media-actions"><button class="mini-btn" data-media="previous">‹</button><button class="mini-btn" data-media="play_pause">▶ / ❚❚</button><button class="mini-btn" data-media="next">›</button></div></div></div></article>
  <article class="widget glass"><div class="widget-title"><strong>📹 Caméra</strong><span class="muted">Live</span></div><div class="camera-feed" id="cameraFeed">Flux caméra</div></article>
  <article class="widget wide glass"><div class="widget-title"><strong>⚡ Scènes rapides</strong><span class="muted">Automatisations</span></div><div class="scenes"><button class="scene" data-scene="night">🌙<br>Mode Nuit</button><button class="scene" data-scene="away">🚪<br>Départ</button><button class="scene" data-scene="movie">🎬<br>Cinéma</button></div></article>`;
  bindWidgets(); renderCamera();
}
function renderCamera(){const id=CFG.entities?.camera;if(!id)return;const a=attrs(id);const url=a.entity_picture;if(url)$('#cameraFeed').innerHTML=`<img src="${esc(url.startsWith('http')?url:haUrl(url))}" alt="Caméra">`;}
function bindWidgets(){
  document.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>{const id=b.dataset.light; call('light',st(id)?.state==='on'?'turn_off':'turn_on',{entity_id:id});});
  document.querySelectorAll('[data-media]').forEach(b=>b.onclick=()=>{const service=b.dataset.media==='play_pause'?'media_play_pause':'media_'+b.dataset.media; call('media_player',service,{entity_id:CFG.entities.media});});
  document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{const map={night:'scene.mode_nuit',away:'scene.depart',movie:'scene.cinema'}; if(map[b.dataset.scene])call('scene','turn_on',{entity_id:map[b.dataset.scene]});});
}
function renderVehicle(){const v=CFG.entities?.vehicle;if(!v)return;$('#vehicleName').textContent=v.name||'Véhicule';const lock=val(v.lock);$('#vehicleLock').textContent=lock==='locked'?'🔒 Verrouillé':lock==='unlocked'?'🔓 Déverrouillé':'—';$('#telemetry').innerHTML=[['⛽',val(v.fuel),'CARBURANT'],['↗',val(v.range),'AUTONOMIE KM'],['◉',val(v.tireFrontLeft),'AVG'],['◉',val(v.tireFrontRight),'AVD'],['◉',val(v.tireRearLeft),'ARG'],['◉',val(v.tireRearRight),'ARD']].map(x=>`<div class="metric"><b>${esc(x[0])} ${esc(x[1])}</b><span>${esc(x[2])}</span></div>`).join('');}
function weatherIcon(s){return ({'sunny':'☀️','clear-night':'🌙','cloudy':'☁️','rainy':'🌧️','pouring':'🌧️','snowy':'❄️','fog':'🌫️','partlycloudy':'⛅'})[s]||'🌤️'}
setInterval(()=>$('#clock').textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),1000);
$('#refreshBtn').onclick=()=>send('get_states');
connect();