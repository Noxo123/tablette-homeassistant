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
  vehicle: {
    enabled: true, name: 'Véhicule', model: '', image: '',
    lock: '', fuel: '', battery: '', range: '', tireFrontLeft: '', tireFrontRight: '', tireRearLeft: '', tireRearRight: ''
  },
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
  try { return { ...clone(DEFAULT_CONFIG), ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; }
  catch { return clone(DEFAULT_CONFIG); }
}
function writeConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
function haBase() { return String(readConfig().homeAssistant?.url || '').replace(/\/$/, ''); }
function haHeaders() {
  const token = readConfig().homeAssistant?.token || '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
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
app.get('/api/config', (_req, res) => {
  const c = readConfig();
  res.json({ ...c, homeAssistant: { url: c.homeAssistant.url, connected: Boolean(c.homeAssistant.url && c.homeAssistant.token) } });
});
app.get('/api/config/raw', (_req, res) => res.json(readConfig()));
app.put('/api/config', (req, res) => {
  const current = readConfig();
  const incoming = req.body || {};
  const next = { ...current, ...incoming, homeAssistant: { ...current.homeAssistant, ...(incoming.homeAssistant || {}) } };
  writeConfig(next);
  res.json({ ok: true, config: next });
});

app.get('/api/entities', async (_req, res) => {
  try {
    const states = await haFetch('/states');
    res.json(states.map(s => ({
      entity_id: s.entity_id, state: s.state,
      friendly_name: s.attributes?.friendly_name || s.entity_id,
      domain: s.entity_id.split('.')[0],
      device_class: s.attributes?.device_class || null,
      unit: s.attributes?.unit_of_measurement || null,
      attributes: s.attributes || {}
    })));
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/states', async (_req, res) => {
  try { res.json(await haFetch('/states')); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/states/:entity', async (req, res) => {
  try { res.json(await haFetch(`/states/${encodeURIComponent(req.params.entity)}`)); }
  catch (e) { res.status(404).json({ error: e.message }); }
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
  try { const data = await haFetch('/'); res.json({ ok: true, data }); }
  catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// Optional WebSocket endpoint for future realtime clients. HA credentials remain server-side.
const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', socket => {
  let timer;
  const sendStates = async () => {
    try { socket.send(JSON.stringify({ type: 'states', states: await haFetch('/states') })); }
    catch (e) { socket.send(JSON.stringify({ type: 'error', error: e.message })); }
  };
  sendStates(); timer = setInterval(sendStates, 2000);
  socket.on('close', () => clearInterval(timer));
});

ensureConfig();
server.listen(PORT, () => console.log(`\nNoxo Home running on http://localhost:${PORT}\nPanel: http://localhost:${PORT}/panel\n`));
