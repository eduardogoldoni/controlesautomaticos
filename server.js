import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import eWelink from 'ewelink-api';
import admin from 'firebase-admin';

/** ---------------- Firebase ---------------- */
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

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Env Firebase incompleto.');
    }

    // aceita chave com \n
    privateKey = privateKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
}
initFirebase();
const rtdb = admin.database();

/** ---------------- Constantes ---------------- */
const PATH_CTRL = '/meg/control';
const PATH_TELM = '/meg/telemetry';

/** ---------------- eWeLink ----------------
 * Forçamos endpoint HTTPS 443 (evita :8080) se EWL_API_BASE estiver definido.
 * Ex.: https://sa-apia.coolkit.cc | https://us-apia.coolkit.cc | https://eu-apia.coolkit.cc | https://as-apia.coolkit.cc
 */
const EW_BASE = process.env.EWL_API_BASE?.trim();
const ewOptions = {
  email: process.env.EWL_EMAIL,
  password: process.env.EWL_PASSWORD,
  region: process.env.EWL_REGION || 'sa',
  // algumas versões da lib aceitam nomes diferentes — passamos todos
  apiUrl: EW_BASE,
  endpoint: EW_BASE,
  baseUrl: EW_BASE,
  requestTimeout: 15000,
};

const ew = new eWelink(ewOptions);

async function loginEnsure() {
  try {
    await ew.getCredentials(); // força login/refresh
  } catch (e) {
    console.error('Falha login eWeLink:', e?.message || e);
    throw e;
  }
}

// Busca todos os dispositivos automaticamente
async function getAllDevices() {
  await loginEnsure();
  const list = await ew.getDevices();
  return list || [];
}

async function readStatus(deviceId) {
  await loginEnsure();
  const dev = await ew.getDevice(deviceId);
  const params = dev?.params || {};
  const state = params.switch || params.switches?.[0]?.switch || 'unknown';
  const temperature =
    params.currentTemperature ?? params.temperature ?? params.tmp ?? null;
  const humidity =
    params.currentHumidity ?? params.humidity ?? params.hum ?? null;
  const online = dev?.online ?? true;
  return { deviceId, state, temperature, humidity, online, raw: dev };
}

async function setPower(deviceId, desired) {
  await loginEnsure();
  const res = await ew.setDevicePowerState(deviceId, desired);
  return res;
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

async function watchCommands(deviceId) {
  const ref = rtdb.ref(`${PATH_CTRL}/${deviceId}`);
  ref.on('value', async snap => {
    const data = snap.val();
    if (!data) return;
    const cmd = (data.command || '').toLowerCase();
    if (cmd !== 'on' && cmd !== 'off') return;
    try {
      await setPower(deviceId, cmd);
      await pushTelemetry(deviceId);
      await ref.set({});
    } catch (e) {
      console.error('Erro executando comando', deviceId, cmd, e?.message || e);
    }
  });
}

// Inicia watchers para todos os devices automaticamente
async function initWatchers() {
  try {
    const devices = await getAllDevices();
    devices.forEach(dev => watchCommands(dev.deviceid));
    console.log('[AUTO] Dispositivos monitorados:', devices.map(d => d.deviceid));
  } catch (e) {
    console.error('[AUTO] Erro ao iniciar watchers:', e?.message || e);
  }
}
initWatchers();

// Polling automático de todos os devices
const POLL_MS = Number(process.env.POLL_MS || 8000);
setInterval(async () => {
  try {
    const devices = await getAllDevices();
    devices.forEach(dev => pushTelemetry(dev.deviceid));
    if (!devices?.length) console.log('[AUTO] Nenhum device encontrado na conta eWeLink.');
  } catch (e) {
    console.error('[AUTO] Poll error:', e?.message || e);
  }
}, POLL_MS);

/** ---------------- HTTP ---------------- */
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', async (_, res) => {
  try {
    const devices = await getAllDevices();
    res.json({
      ok: true,
      devices: devices.map(d => d.deviceid),
      ctrlPath: PATH_CTRL,
      telmPath: PATH_TELM,
      region: ewOptions.region,
      apiBase: EW_BASE || 'default',
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const list = await getAllDevices();
    res.json(list);
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

/** ---------------- Start ---------------- */
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () =>
  console.log(
    `Ponte eWeLink (modo AUTO) rodando em http://localhost:${PORT}`,
  ),
);
