import express from 'express';
import cors from 'cors';
import { router } from './routes.js';

const app = express();

// CORS — trave no seu domínio estático (ou use env FRONT_ORIGIN)
const FRONT = process.env.FRONT_ORIGIN || 'https://imagens.japanbrinquedos.com.br';
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (origin === FRONT) return cb(null, true);
    return cb(null, false);
  }
}));

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/', router);

// Porta do Render
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server up on :${PORT} (origin: ${FRONT})`);
});
