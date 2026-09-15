// ═══════════════════════════════════════════════════════════════════════
// DIAGNOSTICA WHATSAPP/META — SOLO LETTURA, NON invia messaggi.
// - Carica .env.local con trim robusto (rimuove \r, spazi esterni, virgolette).
// - NON stampa mai token/access token/secret: mostra solo presenza/lunghezza/formato.
// - Verifica raggiungibilità Graph API.
// - Verifica Phone Number ID e token con una chiamata NON distruttiva
//   (GET sul numero: non invia messaggi).
// Uso: node scripts/__diag_whatsapp.cjs
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');

function readEnv(filePath) {
  const out = {};
  // CRLF Windows: rimuove TUTTI i \r prima dello split, poi trim tot.
  const text = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = (m[2] || '').trim();
    const first = val[0];
    const last = val[val.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val.trim(); // trim anche dopo la rimozione virgolette
  }
  return out;
}

const env = readEnv('.env.local');
const token = env.WHATSAPP_ACCESS_TOKEN || '';
const phoneId = env.WHATSAPP_PHONE_NUMBER_ID || '';
const apiVersion = env.WHATSAPP_API_VERSION || 'v23.0';

function mask(s) {
  if (!s) return '(vuoto)';
  return s.slice(0, 4) + '…' + s.slice(-4) + ` (len=${s.length})`;
}

async function graphGet(pathname) {
  const url = `https://graph.facebook.com/${apiVersion}${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });
  clearTimeout(timer);
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

(async () => {
  console.log('=== DIAGNOSTICA WHATSAPP/META (SOLO LETTURA — nessun messaggio) ===\n');

  // 1) Presenza/format token
  console.log('[1] WHATSAPP_ACCESS_TOKEN:', token ? `presente ${mask(token)}` : 'MISSING');
  console.log('[2] WHATSAPP_PHONE_NUMBER_ID:', phoneId ? (Number.isFinite(Number(phoneId)) ? `presente (${phoneId.length} cifre)` : 'presente ma NON numerico') : 'MISSING');
  console.log('[3] WHATSAPP_API_VERSION:', apiVersion);
  console.log('[4] WHATSAPP_ENABLED:', env.WHATSAPP_ENABLED ?? '(default attivo)');

  if (!token || !phoneId) {
    console.log('\nFINE: manca token o phone_number_id — impossibile proseguire.');
    process.exit(1);
  }

  // 2) Raggiungibilità Graph API (GET generico sicuro)
  console.log('\n[5] Raggiungibilità Graph API (GET /' + apiVersion + ')…');
  const reach = await graphGet('/').catch((e) => ({ status: 'NET', ok: false, text: e.message }));
  console.log('    reach:', reach.status, reach.ok ? '' : (' — ' + reach.text.slice(0, 120)));

  // 3) Verifica NON distruttiva del Phone Number ID (GET info numero, non invia)
  console.log('\n[6] Verifica Phone Number ID + token (GET /' + apiVersion + '/' + phoneId + '?fields=id,display_phone_number,verified_name,code_verification_status,name_status,platform_type)…');
  const fields = 'id,display_phone_number,verified_name,code_verification_status,name_status,platform_type';
  const pn = await graphGet(`/${phoneId}?fields=${encodeURIComponent(fields)}`).catch((e) => ({ status: 'NET', ok: false, text: e.message }));
  console.log('    status:', pn.status);
  let detail = '';
  if (pn.ok) {
    try {
      const j = JSON.parse(pn.text);
      detail = `id=${j.id} display=${j.display_phone_number} verified_name=${j.verified_name} code_verification_status=${j.code_verification_status} name_status=${j.name_status} platform_type=${j.platform_type}`;
      console.log('    AVVERTENZA: verified_name="' + (j.verified_name || '') + '" — se è "Test Number" (+1 555-…) NON è un numero di produzione.');
    } catch {
      detail = pn.text.slice(0, 160);
    }
  } else {
    let parsed = null;
    try { parsed = JSON.parse(pn.text); } catch { parsed = { error: { message: pn.text.slice(0, 160) } }; }
    const err = parsed?.error ?? {};
    detail = `code=${err.code ?? '?'} subcode=${err.error_subcode ?? '-'} msg=${(err.message || '').slice(0, 180)}`;
  }
  console.log('    esito:', pn.ok ? 'OK' : 'ERRORE', '—', detail);

  // 4) Tipo/scadenza token via debug_token (NON stampa il token)
  console.log('\n[7] Tipo e scadenza token (GET /' + apiVersion + '/debug_token?input_token=<omesso>)…');
  const dbg = await graphGet('/debug_token?input_token=' + encodeURIComponent(token)).catch((e) => ({ status: 'NET', ok: false, text: e.message }));
  if (dbg.ok) {
    try {
      const j = JSON.parse(dbg.text).data;
      const scad = j.expires_at ? new Date(j.expires_at * 1000).toISOString() : 'mai';
      const emesso = j.issued_at ? new Date(j.issued_at * 1000).toISOString() : '?';
      console.log('    type:', j.type, '| is_valid:', j.is_valid, '| emesso:', emesso, '| scade:', scad);
      console.log('    scopes:', (j.scopes || []).join(', '));
      if (j.type === 'SYSTEM_USER') console.log('    OK: token di sistema (non il temporaneo 24h).');
      else console.log('    ATTENZIONE: token non di tipo SYSTEM_USER — se scade entro 24h è il temporaneo del quickstart.');
    } catch { console.log('    risposta non parsabile:', dbg.text.slice(0, 160)); }
  } else {
    let parsed = null;
    try { parsed = JSON.parse(dbg.text); } catch { parsed = { error: { message: dbg.text.slice(0, 160) } }; }
    const err = parsed?.error ?? {};
    console.log('    ERRORE: code=' + (err.code ?? '?') + ' msg=' + (err.message || '').slice(0, 180));
  }

  // 5) Template: l'edge è su /{waba_id}/message_templates; il WABA non è
  //    ricavabile dal phone number con questo token -> esito esplicito.
  console.log('\n[8] Verifica template (edge /{waba_id}/message_templates)…');
  const tpl = await graphGet(`/${phoneId}/message_templates`).catch((e) => ({ status: 'NET', ok: false, text: e.message }));
  if (tpl.ok) {
    const j = JSON.parse(tpl.text);
    const nomi = (j.data || []).map((t) => t.name + ' (' + (t.status || '?') + ')');
    console.log('    OK — template accessibili:', nomi.length ? nomi.join(', ') : '(nessuno)');
  } else {
    let parsed = null;
    try { parsed = JSON.parse(tpl.text); } catch { parsed = { error: { message: tpl.text.slice(0, 160) } }; }
    const err = parsed?.error ?? {};
    console.log('    NON VERIFICABILE via questo endpoint: code=' + (err.code ?? '?') + ' msg=' + (err.message || '').slice(0, 180));
    console.log('    Il WABA ID non è ricavabile con il token attuale (nessun WABA assegnato al system user).');
    console.log('    Verifica manuale: WhatsApp Manager -> Messaging templates -> nuovo_ordine_incitta (it, APPROVED).');
  }

  console.log('\n=== FINE DIAGNOSTICA (nessun messaggio inviato) ===');
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(2);
});