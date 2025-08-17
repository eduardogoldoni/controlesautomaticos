const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const ewelink = require('ewelink-api');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Variáveis de ambiente
const {
  EWL_EMAIL,
  EWL_PASSWORD,
  EWL_REGION,
  EWL_API_BASE,
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_DATABASE_URL,
  PORT
} = process.env;

// Inicializa Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: FIREBASE_DATABASE_URL
});

// Inicializa eWeLink
const connection = new ewelink({
  email: EWL_EMAIL,
  password: EWL_PASSWORD,
  region: EWL_REGION,
  apiUrl: EWL_API_BASE
});

// Rota de teste
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'eWeLink bridge is running' });
});

// Rota para listar devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await connection.getDevices();
    res.json(devices);
  } catch (err) {
    console.error('Erro ao buscar devices:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Rota para ligar/desligar
app.post('/api/device/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { state } = req.body; // "on" ou "off"
    const result = await connection.setDevicePowerState(id, state);
    res.json(result);
  } catch (err) {
    console.error('Erro ao controlar device:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Inicia servidor
const port = PORT || 10000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
