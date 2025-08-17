# Ponte eWeLink → Firebase (MEG)

Esta aplicação cria uma ponte entre dispositivos **eWeLink (Sonoff, etc.)** e o **Firebase**, 
permitindo integração com o sistema de automação da MEG.

## 🚀 Como usar

1. Clone este repositório e instale as dependências:
   ```bash
   npm install
   ```

2. Configure as variáveis de ambiente (Render ou .env.local) seguindo o modelo:
   - `EWL_EMAIL` → email da conta eWeLink
   - `EWL_PASSWORD` → senha da conta eWeLink
   - `EWL_REGION` → região (`sa`, `us`, `eu`, `as`)
   - `EWL_API_BASE` → base da API (`https://sa-apia.coolkit.cc` etc.)

3. Configure as chaves do Firebase Admin (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL`).

4. Rode localmente:
   ```bash
   npm start
   ```

5. Deploy no Render:
   - Crie novo Web Service com este repo
   - Defina as variáveis de ambiente (não suba seu `.env` real)
   - O Render define automaticamente a porta via `PORT`.

## 🔗 Endpoints

- `GET /` → Testa se a ponte está rodando
- `GET /api/devices` → Lista os dispositivos vinculados à conta eWeLink
- `POST /api/device/:id/toggle` → Liga/desliga dispositivo (`{ "state": "on" | "off" }`)

---

Mantido por **MEG Manutenções**
