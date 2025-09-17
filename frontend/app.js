// BASE_URL da API (Render)
const BASE_URL = 'https://bling-updater-backend.onrender.com';

const el = (id) => document.getElementById(id);

// ---- parser de colagem: extrai blocos *...* mesmo com quebras de linha/HTML
function extractStarBlocks(text) {
  const s = String(text || '').replace(/\r/g, '');
  // pega qualquer coisa entre * ... * (dotall)
  const re = /\*[\s\S]*?\*/g;
  const blocks = [];
  let m;
  while ((m = re.exec(s)) !== null) blocks.push(m[0]);
  if (blocks.length) return blocks;
  // fallback: se não houver *...*, usa linhas simples
  return s.split('\n').map(x => x.trim()).filter(Boolean);
}

// ===== Auth status =====
async function refreshAuth() {
  try {
    const r = await fetch(`${BASE_URL}/auth/status`);
    const js = await r.json();
    const pill = el('auth-pill');
    if (js.hasToken) {
      pill.textContent = `Auth: OK (${js.expiresIn ?? '?'}s)`;
      pill.className = 'pill ok';
      el('btn-patch').disabled = false;
    } else {
      pill.textContent = 'Auth: AUSENTE';
      pill.className = 'pill bad';
      el('btn-patch').disabled = true;
    }
  } catch {
    el('auth-pill').textContent = 'Auth: erro';
    el('auth-pill').className = 'pill bad';
  }
}

el('btn-auth').onclick = () => {
  window.open(`${BASE_URL}/auth/start`, '_blank');
  setTimeout(refreshAuth, 1500);
};

// ===== Colar & Enviar =====
el('btn-preview-bn').onclick = async () => {
  const raw = el('bn-input').value;
  const lines = extractStarBlocks(raw);
  if (!lines.length) return alert('Cole pelo menos 1 linha.');
  const r = await fetch(`${BASE_URL}/bn/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines })
  });
  const js = await r.json();
  el('bn-output').textContent = JSON.stringify(js, null, 2);
};

el('btn-patch').onclick = async () => {
  const parsed = el('bn-output').textContent.trim();
  if (!parsed) return alert('Faça a pré-visualização primeiro.');
  const js = JSON.parse(parsed);
  const items = js.items || [];
  if (!items.length) return alert('Nada para enviar.');

  let okCount = 0, failCount = 0, skipCount = 0;
  for (const it of items) {
    const cols = (it.bnLine || '').split('|');
    // força ID numérico (remove qualquer não-dígito)
    const idNum = Number(String(cols[0] || '').replace(/\D+/g, ''));
    if (!Number.isFinite(idNum) || idNum <= 0) { skipCount++; continue; }

    const payload = it.patchPayload || {};
    try {
      const res = await fetch(`${BASE_URL}/bling/patch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': (crypto?.randomUUID?.() || String(Math.random()))
        },
        body: JSON.stringify({ id: idNum, data: payload })
      });
      const jr = await res.json();
      if (jr.ok) okCount++; else failCount++;
    } catch {
      failCount++;
    }
  }
  alert(`Atualização concluída.\nSucesso: ${okCount}\nFalhas: ${failCount}\nIgnorados (ID inválido): ${skipCount}`);
};

// ===== Buscar & Montar =====
el('btn-build').onclick = async () => {
  const seeds = extractStarBlocks(el('seed-input').value);
  if (!seeds.length) return alert('Cole pelo menos 1 seed (*ID|Código|Descrição*).');
  const r = await fetch(`${BASE_URL}/search/build`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seeds })
  });
  const js = await r.json();
  el('seed-output').textContent = JSON.stringify(js, null, 2);
};

el('btn-fetch').onclick = async () => {
  const parsed = el('seed-output').textContent.trim();
  if (!parsed) return alert('Faça a pré-visualização primeiro.');
  const js = JSON.parse(parsed);
  const items = (js.items || []).map(x => {
    // heurística simples: tenta achar EAN de 13 dígitos no texto
    const text = String(x.seed || '');
    const m = text.match(/\b(\d{13})\b/);
    return { name: text, ean: m ? m[1] : undefined, code: undefined, id: undefined };
  });
  const r = await fetch(`${BASE_URL}/search/fetch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, mode: 'safe' })
  });
  const js2 = await r.json();
  el('seed-output').textContent = JSON.stringify(js2, null, 2);
};

// init
refreshAuth();
