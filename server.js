const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname, { index: 'index.html' }));

const DEFAULT_CONFIG = {
  homeAssistant: { url: '', token: '' },
  profiles: [
    { id: 'nolhan', name: 'Nolhan', entity: '', battery: '', avatar: '', states: {} },
    { id: 'lisea', name: 'Lisea', entity: '', battery: '', avatar: '', states: {} }
  ],
  widgets: [],
  vehicle: { enabled: true, name: 'Véhicule', model: '', image: '', iframe: '', lock: '', fuel: '', battery: '', range: '', tireFrontLeft: '', tireFrontRight: '', tireRearLeft: '', tireRearRight: '' },
  scenes: [
    { id: 'night', name: 'Mode Nuit', icon: '🌙', entity: '' },
    { id: 'away', name: 'Départ', icon: '🚪', entity: '' },
    { id: 'movie', name: 'Cinéma', icon: '🎬', entity: '' }
  ]
};

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function ensureConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
}
function readConfig() {
  ensureConfig();
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      ...clone(DEFAULT_CONFIG), ...saved,
      homeAssistant: { ...DEFAULT_CONFIG.homeAssistant, ...(saved.homeAssistant || {}) },
      profiles: saved.profiles || clone(DEFAULT_CONFIG.profiles),
      widgets: saved.widgets || [],
      scenes: saved.scenes || clone(DEFAULT_CONFIG.scenes),
      vehicle: { ...DEFAULT_CONFIG.vehicle, ...(saved.vehicle || {}) }
    };
  } catch { return clone(DEFAULT_CONFIG); }
}
function writeConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
function publicConfig(c) {
  return { ...c, homeAssistant: { url: c.homeAssistant?.url || '', connected: Boolean(c.homeAssistant?.url && c.homeAssistant?.token) } };
}
function haBase() { return String(readConfig().homeAssistant?.url || '').replace(/\/$/, ''); }
function haHeaders() {
  return { Authorization: `Bearer ${readConfig().homeAssistant?.token || ''}`, 'Content-Type': 'application/json' };
}
async function haFetch(endpoint, options = {}) {
  const base = haBase();
  if (!base) throw new Error('Home Assistant URL non configurée');
  const response = await fetch(`${base}/api${endpoint}`, { ...options, headers: { ...haHeaders(), ...(options.headers || {}) } });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

app.get('/panel', (_req, res) => res.sendFile(path.join(__dirname, 'panel.html')));
app.get('/api/config', (_req, res) => res.json(publicConfig(readConfig())));
app.get('/api/config/raw', (_req, res) => res.json(readConfig()));
app.put('/api/config', (req, res) => {
  const current = readConfig();
  const incoming = req.body || {};
  const next = { ...current, ...incoming, homeAssistant: { ...current.homeAssistant, ...(incoming.homeAssistant || {}) } };
  writeConfig(next);
  broadcast({ type: 'config_changed', config: publicConfig(next) });
  res.json({ ok: true, config: next });
});

app.get('/api/entities', async (_req, res) => {
  try {
    const states = await haFetch('/states');
    res.json(states.map(s => ({ entity_id: s.entity_id, state: s.state, friendly_name: s.attributes?.friendly_name || s.entity_id, domain: s.entity_id.split('.')[0], device_class: s.attributes?.device_class || null, unit: s.attributes?.unit_of_measurement || null, attributes: s.attributes || {} })));
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/states', async (_req, res) => {
  try { res.json(await haFetch('/states')); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/states/:entity', async (req, res) => {
  try { res.json(await haFetch(`/states/${encodeURIComponent(req.params.entity)}`)); } catch (e) { res.status(404).json({ error: e.message }); }
});
app.post('/api/service', async (req, res) => {
  const { domain, service, entity_id, service_data = {} } = req.body || {};
  if (!domain || !service) return res.status(400).json({ error: 'domain et service requis' });
  try {
    const data = { ...service_data };
    if (entity_id) data.entity_id = entity_id;
    res.json(await haFetch(`/services/${domain}/${service}`, { method: 'POST', body: JSON.stringify(data) }));
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/test', async (_req, res) => {
  try { const data = await haFetch('/'); res.json({ ok: true, data }); } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Generic CRUD used by the panel. The dashboard stores only configuration; the HA token stays server-side.
function collectionRoute(collection) {
  app.get(`/api/${collection}`, (_req, res) => res.json(readConfig()[collection] || []));
  app.post(`/api/${collection}`, (req, res) => {
    const config = readConfig();
    const item = { id: req.body?.id || `${collection}-${Date.now()}`, ...(req.body || {}) };
    config[collection] = [...(config[collection] || []), item];
    writeConfig(config); broadcast({ type: 'config_changed', config: publicConfig(config) });
    res.status(201).json(item);
  });
  app.put(`/api/${collection}/:id`, (req, res) => {
    const config = readConfig();
    const list = config[collection] || [];
    const index = list.findIndex(x => String(x.id) === String(req.params.id));
    if (index < 0) return res.status(404).json({ error: 'Introuvable' });
    config[collection][index] = { ...list[index], ...(req.body || {}), id: list[index].id };
    writeConfig(config); broadcast({ type: 'config_changed', config: publicConfig(config) });
    res.json(config[collection][index]);
  });
  app.delete(`/api/${collection}/:id`, (req, res) => {
    const config = readConfig();
    config[collection] = (config[collection] || []).filter(x => String(x.id) !== String(req.params.id));
    writeConfig(config); broadcast({ type: 'config_changed', config: publicConfig(config) });
    res.json({ ok: true });
  });
}
['devices', 'profiles', 'widgets'].forEach(collectionRoute);

const wss = new WebSocket.Server({ server, path: '/ws' });
function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(data); });
}
wss.on('connection', async socket => {
  socket.send(JSON.stringify({ type: 'config', config: publicConfig(readConfig()) }));
  try { socket.send(JSON.stringify({ type: 'states', states: await haFetch('/states') })); } catch {}
});

// Server-side HA WebSocket: one authenticated connection broadcasts state changes to dashboard clients.
let haWs;
let haMessageId = 1;
let reconnectTimer;
function connectHA() {
  clearTimeout(reconnectTimer);
  const c = readConfig();
  if (!c.homeAssistant?.url || !c.homeAssistant?.token) return;
  const url = c.homeAssistant.url.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/websocket';
  try { haWs = new WebSocket(url); } catch { reconnectTimer = setTimeout(connectHA, 5000); return; }
  haWs.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'auth_required') haWs.send(JSON.stringify({ type: 'auth', access_token: c.homeAssistant.token }));
    if (msg.type === 'auth_ok') haWs.send(JSON.stringify({ id: haMessageId++, type: 'subscribe_events', event_type: 'state_changed' }));
    if (msg.type === 'event' && msg.event?.event_type === 'state_changed') broadcast({ type: 'state_changed', state: msg.event.data?.new_state || null });
  });
  haWs.on('close', () => { reconnectTimer = setTimeout(connectHA, 5000); });
  haWs.on('error', () => {});
}

ensureConfig();
connectHA();
server.listen(PORT, () => console.log(`Noxo Home running on http://localhost:${PORT} | Panel: http://localhost:${PORT}/panel`));
