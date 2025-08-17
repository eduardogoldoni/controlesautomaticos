import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import eWelink from 'ewelink-api';
import admin from 'firebase-admin';

/** ================= Firebase Admin ================= */
function initFirebase() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) throw new Error('Env Firebase incompleto.');
    privateKey = privateKey.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
}
initFirebase();
const rtdb = admin.database();

const PATH_CTRL = '/meg/control';
const PATH_TELM = '/meg/telemetry';

/** ================= eWeLink ================= */
const ew = new eWelink({
  email: process.env.EWL_EMAIL,
  password: process.env.EWL_PASSWORD,
  region: process.env.EWL_REGION || 'sa',
});

async function loginEnsure() {
  try {
    await ew.getCredentials();
  } catch (e) {
    console.error('Falha login eWeLink:', e?.message || e);
    throw e;
  }
}

/** ================= Dispositivos (AUTO vs LIST) ================= */
let MONITORED_IDS = new Set();
const MODE = (process.env.SONOFF_MODE || 'AUTO').toUpperCase();

function idsFromEnv() {
  return (process.env.SONOFF_DEVICE_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function extractId(dev) {
  // bibliotecas podem expor 'deviceid' ou 'deviceId'
  return dev?.deviceid || dev?.deviceId || dev?.id || null;
}

async function refreshDevices() {
  await loginEnsure();
  if (MODE === 'AUTO') {
    const list = await ew.getDevices();
    const arr = Array.isArray(list) ? list : (list?.devicelist || list?.devices || []);
    const next = new Set();
    for (const d of arr) {
      const id = extractId(d);
      if (id) next.add(id);
    }
    if (next.size === 0) {
      console.warn('[AUTO] Nenhum device encontrado na conta eWeLink.');
    }
    MONITORED_IDS = next;
    console.log('[AUTO] Dispositivos monitorados:', Array.from(MONITORED_IDS));
  } else {
    MONITORED_IDS = new Set(idsFromEnv());
    console.log('[LIST] Dispositivos monitorados:', Array.from(MONITORED_IDS));
  }
}

/** ================= Operações ================= */
async function readStatus(deviceId) {
  await loginEnsure();
  const dev = await ew.getDevice(deviceId);
  const params = dev?.params || {};
  const state = params.switch || params.switches?.[0]?.switch || 'unknown';
  const temperature = params.currentTemperature ?? params.temperature ?? params.tmp ?? null;
  const humidity = params.currentHumidity ?? params.humidity ?? params.hum ?? null;
  const online = dev?.online ?? true;
  return { deviceId, state, temperature, humidity, online, raw: dev };
}

async function setPower(deviceId, desired) {
  await loginEnsure();
  return await ew.setDevicePowerState(deviceId, desired); // 'on' | 'off'
}

async function pushTelemetry(deviceId) {
  try {
    const st = await readStatus(deviceId);
    const payload = {
      state: st.state,
      temperature: st.temperature,
      humidity: st.humidity,
      online: st.online,
      at: Date.now(),
    };
    await rtdb.ref(`${PATH_TELM}/${deviceId}`).set(payload);
    return payload;
  } catch (e) {
    console.error('Telemetry error', deviceId, e?.message || e);
  }
}

/** ================= Observador de comandos dinâmico =================
 * Em vez de criar um listener por device, observamos /meg/control e
 * reagimos a mudanças/adições de filhos. A chave do filho é o deviceId.
 */
const ctrlRoot = rtdb.ref(PATH_CTRL);
async function handleCtrlSnapshot(snap) {
  const deviceId = snap.key;
  const data = snap.val();
  const cmd = (data?.command || '').toLowerCase();
  if (!deviceId || (cmd !== 'on' && cmd !== 'off')) return;
  try {
    // Em AUTO, se for um device novo, adiciona ao set para polling
    if (!MONITORED_IDS.has(deviceId) && MODE === 'AUTO') {
      MONITORED_IDS.add(deviceId);
      console.log('[AUTO] Novo device via comando:', deviceId);
    }
    await setPower(deviceId, cmd);
    await pushTelemetry(deviceId);
    await rtdb.ref(`${PATH_CTRL}/${deviceId}`).set({}); // limpa comando
  } catch (e) {
    console.error('Erro executando comando', deviceId, cmd, e?.message || e);
  }
}
ctrlRoot.on('child_added', handleCtrlSnapshot);
ctrlRoot.on('child_changed', handleCtrlSnapshot);

/** ================= Tarefas periódicas ================= */
const POLL_MS = Number(process.env.POLL_MS || 8000);
const REFRESH_DEVICES_MS = Number(process.env.REFRESH_DEVICES_MS || 60000);

// 1) Atualiza lista de devices (especialmente em AUTO)
await refreshDevices();
setInterval(refreshDevices, REFRESH_DEVICES_MS);

// 2) Poll de telemetria para todos os monitorados
setInterval(() => {
  MONITORED_IDS.forEach(id => pushTelemetry(id));
}, POLL_MS);

/** ================= API HTTP ================= */
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', async (_, res) => {
  res.json({
    ok: true,
    mode: MODE,
    devices: Array.from(MONITORED_IDS),
    ctrlPath: PATH_CTRL,
    telmPath: PATH_TELM,
    pollMs: POLL_MS,
    refreshDevicesMs: REFRESH_DEVICES_MS,
  });
});

app.get('/api/devices', async (req, res) => {
  try {
    await loginEnsure();
    const list = await ew.getDevices();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/api/reload', async (req, res) => {
  try {
    await refreshDevices();
    res.json({ ok: true, devices: Array.from(MONITORED_IDS) });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.get('/api/device/:id/status', async (req, res) => {
  try {
    const out = await readStatus(req.params.id);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/api/device/:id/:action(on|off)', async (req, res) => {
  try {
    const action = req.params.action.toLowerCase();
    await setPower(req.params.id, action);
    const st = await readStatus(req.params.id);
    res.json({ ok: true, after: st });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Ponte eWeLink (modo ${MODE}) rodando em http://localhost:${PORT}`));
