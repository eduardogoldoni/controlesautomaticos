# Deploy como servidor 24/7

## Opção A) Railway (mais simples)
1. Crie conta em https://railway.app e instale o Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```
2. No diretório do projeto:
   ```bash
   railway init
   railway up
   ```
3. No painel da Railway, abra **Variables** e adicione TODAS as variáveis do `.env`.
4. A URL pública aparece em **Settings → Domains**. A API vai responder em `GET /`.

## Opção B) Render (grátis com hibernação)
1. Conecte seu repositório no https://render.com
2. Escolha **New → Web Service** → selecione o repo.
3. Runtime: **Node**, Build: `npm install`, Start: `node server.js` (ou use `render.yaml` deste pacote)
4. Em **Environment** adicione as variáveis do `.env`.

## Opção C) Heroku (se usar Docker ou Procfile)
- Com **Procfile** (neste pacote):
  ```bash
  heroku create
  heroku config:set VAR=valor ...
  git push heroku main
  ```
- Com **Dockerfile**:
  ```bash
  heroku create
  heroku stack:set container
  heroku container:push web
  heroku container:release web
  ```

## Observações
- O app usa `PORT` do ambiente (padrão 3001). Os provedores definem automaticamente.
- Adicione suas **variáveis de ambiente** (eWeLink e Firebase) no provedor escolhido.
