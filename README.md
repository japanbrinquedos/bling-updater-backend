# Bling Updater — Backend

Node.js + TypeScript + Express (ESM). Faz:
- **/bling/preview**: parse/normaliza BN (22 colunas), preservando vazios e imagens extras.
- **/bling/patch**: **PATCH parcial** por **ID** (coluna 1) + **PUT imagens** *apenas se* vierem na linha.
- OAuth v3 (Authorization Code), header **Basic** no token.
- CORS travado ao host do front.

## Endpoints
- `GET /health` — ok.
- `GET /auth/start` — redirect para autorização.
- `GET /auth/callback` — troca code por token, salva.
- `GET /auth/status` — `{ authenticated, expires_in }`
- `POST /auth/refresh` — renova token.
- `POST /bling/preview` — `{ bn }` → `{ cleaned_lines, items, errors }`
- `POST /bling/patch` — `{ bn }` → roda PATCH parcial e (se houver imagens) PUT imagens.
- `POST /bling/skeleton` — `{ seeds }` → 22 colunas padrão.

## Regras chave
- **NÃO enviar**: `tipo`, `formato`, `fornecedor`(10), **Tags**(17), **Código Pai**(18).
- **Coluna 21**: se tiver **HTML**, envia `descricaoCurta` (texto limpo) **e** `descricao` (HTML).
- **Imagens**: coluna 22 aceita múltiplas por `|` ou `,`; colunas extras (23+) também são imagens. Só chama PUT se vier algo.
- **NCM**: 8 dígitos (ex.: `9404.90.00` → `94049000`), senão ignora.
- **Unidade**: default `UN`.
- **Volumes**: default `0`.

## Deploy no Render
1. Suba este repo no GitHub.
2. Configure serviço **Web**:
   - Build: `npm install && npm run build`
   - Start: `npm start`
3. **Env Vars**: copie `.env.example` e preencha:
   - `FRONTEND_URL` → sua página estática
   - `CORS_ALLOW_ORIGINS` → host do front
   - `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI`
4. Teste:
   - `GET /health` → `{ ok: true }`
   - `GET /auth/start` → login Bling → callback → `GET /auth/status` deve mostrar `authenticated: true`

## Idempotência
- Envie header `Idempotency-Key` em `/bling/patch`. O backend ecoa a chave e reutiliza na chamada ao Bling.

## Dicas
- Se quiser ativar “Buscar & Montar” de verdade, implemente provedores dentro de `services.ts` (função `buildSkeletonFromSeeds` está pronta).
