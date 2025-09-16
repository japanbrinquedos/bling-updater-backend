// BASE_URL da API (Render)
const BASE_URL = 'https://bling-updater-backend.onrender.com';

const el = (id) => document.getElementById(id);

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
  const lines = el('bn-input').value.split('\n').filter(Boolean);
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

  const ids = [];
  for (const it of items) {
    const cols = (it.bnLine || '').split('|');
    const id = cols[0] || null;
    if (!id) continue;
    const payload = it.patchPayload || {};
    const res = await fetch(`${BASE_URL}/bling/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ id: Number(id), data: payload })
    });
    const jr = await res.json();
    ids.push({ id, ok: jr.ok, result: jr.result });
  }
  alert(`Atualização concluída.\n${ids.length} itens processados.`);
};

// ===== Buscar & Montar =====
el('btn-build').onclick = async () => {
  const seeds = el('seed-input').value.split('\n').filter(Boolean);
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
    // tenta extrair EAN do nome (fallback leve)
    const name = (x.seed || '').toLowerCase();
    const m = name.match(/\b(\d{13})\b/);
    return { name: x.seed, ean: m ? m[1] : undefined, code: undefined, id: undefined };
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
