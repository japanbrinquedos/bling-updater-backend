# Bling Updater Backend (Node/TS)

- OAuth v3 do Bling (Authorization Code + Bearer)
- Rotas:
  - /auth/start, /auth/callback, /auth/status
  - /bn/parse (limpeza, validações, normalizações; consolida imagens extras)
  - /search/build (skeleton BN 22)
  - /search/fetch (enriquecimento custo-benefício)
  - /bling/patch (PATCH com Idempotency-Key) / /auto-fill-missing
- Health: /health

Ambiente:
- BLING_API_BASE, BLING_CLIENT_ID, BLING_CLIENT_SECRET, BLING_REDIRECT_URL
- CORS_ALLOWED_ORIGINS, SESSION_SECRET
