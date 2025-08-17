# Ponte eWeLink ↔ MEG (Automático)

## O que mudou
- **SONOFF_MODE=AUTO**: monitora **todos os dispositivos** da sua conta eWeLink automaticamente.
- Quando você adiciona um novo Sonoff no app, ele **entra sozinho** na telemetria e no controle (sem editar `.env`).

## Como funciona
- Telemetria em: `/meg/telemetry/<deviceId>`
- Comandos em: `/meg/control/<deviceId> = { command: 'on' | 'off' }`
- A ponte também oferece API local:
  - `GET /` → info (lista monitorados)
  - `GET /api/devices` → dispositivos via eWeLink
  - `POST /api/reload` → força recarregar lista (útil se quiser agora)
  - `GET /api/device/:id/status`
  - `POST /api/device/:id/on` e `/off`

## Instalação
```bash
npm i
cp .env.example .env
# Preencha o .env (eWeLink + Firebase)
npm start
```

## Variáveis de ambiente
- `SONOFF_MODE=AUTO` → monitora todos os dispositivos; `LIST` → usa `SONOFF_DEVICE_IDS`
- `REFRESH_DEVICES_MS=60000` → frequência (ms) para recarregar a lista em modo AUTO
- `POLL_MS=8000` → polling da telemetria

## Exemplo (front)
```js
// ligar um TH16 específico
firebase.database().ref('/meg/control/10024a6949').set({ command: 'on' });

// observar telemetria de todos (escuta em /meg/telemetry)
firebase.database().ref('/meg/telemetry').on('child_changed', snap => {
  const id = snap.key;
  const t = snap.val();
  console.log('atualizou', id, t);
});
```
