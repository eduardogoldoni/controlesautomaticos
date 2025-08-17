const express = require('express');
const bodyParser = require('body-parser');
const ewelink = require('ewelink-api');

const app = express();
app.use(bodyParser.json());

// Credenciais via variáveis de ambiente
const email = process.env.EWL_EMAIL;
const password = process.env.EWL_PASSWORD;
const region = process.env.EWL_REGION || 'as';
const apiBase = process.env.EWL_API_BASE || 'https://as-apia.coolkit.cc';

// Teste de rota raiz
app.get('/', (req, res) => {
  res.json({ status: 'ok', region, apiBase });
});

// Debug de login
app.get('/api/debug/login', async (req, res) => {
  try {
    const connection = new ewelink({ email, password, region });
    const auth = await connection.getCredentials();
    res.json({ ok: true, info: { region, apiBase, auth } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Listagem de devices
app.get('/api/devices', async (req, res) => {
  try {
    const connection = new ewelink({ email, password, region });
    const devices = await connection.getDevices();
    res.json({ ok: true, count: devices.length, devices });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
