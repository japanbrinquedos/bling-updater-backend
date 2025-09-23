import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { router } from './routes.js';

const app = express();

// CORS
const allowList = new Set(
  (process.env.CORS_ALLOW_ORIGINS || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowList.size === 0) return cb(null, true);
      return cb(null, allowList.has(origin));
    },
    credentials: true,
  }),
);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // <— aceita form-urlencoded
app.use(cookieParser());

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// Rotas da aplicação (auth, preview, patch…)
app.use(router);

// Start
const PORT = Number(process.env.PORT || 10000);
app.listen(PORT, () => {
  console.log(`Backend up on :${PORT}`);
});

export { app };
