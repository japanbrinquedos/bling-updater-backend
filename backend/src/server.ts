import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router } from './routes.js';

const app = express();

// CORS — em prod, whitelist do seu domínio estático
const allowed = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // permitir ferramentas (curl, Postman)
    if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS bloqueado para ${origin}`));
  },
  credentials: false
}));

app.use(express.json({ limit: '2mb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// Rotas principais
app.use(router);

// Error handler simples e padronizado
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const errorId = Math.random().toString(36).slice(2, 9);
  const status = err.status || 500;
  const message = err.message || 'Erro interno';
  console.error(`[${errorId}]`, err);
  res.status(status).json({ ok: false, errorId, message });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🟢 API on http://localhost:${PORT} — CORS ALLOW=${allowed.join(',') || 'ALL'}`);
});
