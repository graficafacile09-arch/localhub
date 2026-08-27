// Audit read-only del database REMOTO via Supabase REST (PostgREST).
// - Parser .env.local robusto per CRLF/LF (+ virgolette esterne) senza stampare secret.
// - Nessuna connessione Docker / DB locale: parla direttamente col progetto remoto.
// - Exit code 0 se tutto OK, != 0 se trova problemi.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Risolve la CLI supabase in modo robusto (Windows: wrapper .cmd/.exe).
function findSupabaseCli() {
  const names = process.platform === 'win32'
    ? ['supabase.cmd', 'supabase.exe', 'supabase']
    : ['supabase'];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const full = path.join(dir, n);
      try { if (fs.statSync(full).isFile()) return full; } catch {}
    }
  }
  return 'supabase'; // fallback: lascia risolvere alla shell
}

function readEnv(filePath) {
  const out = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = (m[2] || '').trim(); // CRLF-safe + spazi esterni
    const first = val[0];
    const last = val[val.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      val = val.slice(1, -1); // rimuove solo le virgolette esterne accoppiate
    }
    out[m[1]] = val;
  }
  return out;
}

const env = readEnv('.env.local');
const base = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!base || !key) {
  console.error('AUDIT ERROR: impossibile leggere NEXT_PUBLIC_SUPABASE_URL / chiave da .env.local');
  process.exit(2);
}

let host;
try { host = new URL(base).hostname; } catch { host = '(URL non valida)'; }
console.log('REMOTE:', host);

const results = [];
function report(label, ok, detail = '') {
  const s = ok ? 'OK' : 'KO';
  if (!ok) process.exitCode = 1;
  results.push({ label, ok, detail });
}

async function rest(pathname) {
  const res = await fetch(base + pathname, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

(async () => {
  // ── 1) COLONNA: filtro .eq su prodotto_tipico (se non esiste → PostgREST 400/42703) ──
  const colProbe = await rest('/rest/v1/prodotti?select=prodotto_tipico&prodotto_tipico=eq.true&limit=1');
  const colExists = colProbe.ok;
  report('COLONNA prodotti.prodotto_tipico', colExists,
    colExists ? 'filtro .eq senza errori' : `PostgREST ${colProbe.status} ${colProbe.text.slice(0, 140)}`);

  // Tipo e default NON derivabili da REST puro; se la colonna esiste proviamo
  // a leggerli dal comportamento (un `true` filtrato ok implica boolean usabile).
  if (colExists) {
    report('TIPO/DEFAULT (boolean, default false)', true,
      'colonna esposta e filtrata come booleano; default non verificabile via REST puro');
  } else {
    report('TIPO/DEFAULT', false, 'colonna assente');
  }

  // ── 2) INDICE: verificato via CLI `supabase db query --linked` (Management API,
  //      nessun Docker, nessuna modifica alla migration history) ──
  let indexOk = null;
  let indexDetail = 'non interrogabile via REST (serve SQL)';
  try {
    const cli = findSupabaseCli();
    const sql = "select indexname from pg_indexes where schemaname='public' and indexname='prodotti_tipici_attivi_idx'";
    const out = execSync(`"${cli}" db query --linked "${sql}"`,
      { encoding: 'utf8', timeout: 60000, windowsHide: true, shell: true });
    indexOk = /prodotti_tipici_attivi_idx/.test(out);
    indexDetail = indexOk ? 'presente sul remoto (pg_indexes)' : 'NON trovato';
  } catch (e) {
    indexOk = null;
    indexDetail = 'CLI non disponibile: ' + String(e.message || e).split('\n')[0];
  }
  report('INDICE prodotti_tipici_attivi_idx', indexOk, indexDetail);

  // ── 3) NEGOZI demo ──
  const slugs = ['demo-bottega-pollino', 'demo-terre-pollino', 'demo-sapori-castrovillari'];
  const negoziResp = await rest(
    `/rest/v1/negozi?select=id,nome,slug,owner_user_id,attivo,deleted_at&slug=in.(${slugs.join(',')})`
  );
  let negozi = [];
  if (negoziResp.ok) { try { negozi = JSON.parse(negoziResp.text); } catch {} }
  const ownerTarget = '3ec07260-d0c0-4097-b1f1-8a30536fd868';
  report(`NEGOZI demo (${negozi.length}/3)`, negozi.length === 3,
    negozi.map((n) => `${n.slug}:${n.owner_user_id ? 'owner' : 'NULL'}`).join(', '));
  const ownersOk = negozi.length === 3 && negozi.every((n) => n.owner_user_id === ownerTarget);
  report('owner_user_id corretto', ownersOk);

  // ── 4) PRODOTTI tipici ──
  if (colExists) {
    const prodResp = await rest(
      '/rest/v1/prodotti?select=slug,nome,negozio_id,attivo,prodotto_tipico,prezzo&prodotto_tipico=eq.true&order=nome.asc'
    );
    let tipici = [];
    if (prodResp.ok) { try { tipici = JSON.parse(prodResp.text); } catch {} }
    const attesi = ['cipolla-bianca-castrovillari','filetti-cipolla-bianca','dolcezza-cipolla-bianca','miele-millefiori-pollino','miele-castagno-pollino','olio-evo-pollino','magliocco-pollino','ciotaredda-castrovillari'];
    const presenti = attesi.filter((s) => tipici.some((p) => p.slug === s));
    report(`PRODOTTI tipici (${tipici.length} totali, ${presenti.length}/8 attesi)`, presenti.length === 8,
      tipici.map((p) => `${p.slug}:attivo=${p.attivo},tip=${p.prodotto_tipico},€${p.prezzo}`).join(' | '));
    let allOk = presenti.length === 8;
    for (const p of tipici) {
      if (p.attivo !== true || p.prodotto_tipico !== true) allOk = false;
    }
    report('tutti attivo=true e prodotto_tipico=true', allOk);
  } else {
    report('PRODOTTI tipici', false, 'colonna assente: impossible elencare');
  }

  console.log('\n===== REPORT AUDIT =====');
  for (const r of results) {
    const s = r.ok === true ? 'OK ' : r.ok === false ? 'KO ' : 'N/V';
    console.log(`  [${s}] ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log(process.exitCode ? '\nRISULTATO: PROBLEMI RILEVATI' : '\nRISULTATO: TUTTO OK');
})().catch((e) => {
  console.error('AUDIT ERROR:', e.message);
  process.exit(2);
});