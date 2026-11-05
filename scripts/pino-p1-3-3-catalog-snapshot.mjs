/**
 * P1.3.3 — snapshot read-only del catalogo pubblico InCittà.
 *
 * Legge esclusivamente public.prodotti e i campi pubblici minimi di
 * public.negozi. Non scrive sul database, non chiama AI e non legge tabelle
 * di clienti, ordini, pagamenti o account.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local --input-type=module \
 *     scripts/pino-p1-3-3-catalog-snapshot.mjs
 *
 * Il file di snapshot non viene mai sovrascritto. L'hash SHA-256 è calcolato
 * sul file finale e scritto in un sidecar `.sha256`.
 */
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHIAVE_SUPABASE =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_SUPABASE || !CHIAVE_SUPABASE) {
  console.error(
    "Configurazione Supabase mancante: impossibile eseguire la lettura in sola lettura."
  );
  process.exit(2);
}

const db = createClient(URL_SUPABASE, CHIAVE_SUPABASE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGINA = 500;

const CAMPI_PRODOTTO = [
  "id",
  "slug",
  "negozio_id",
  "nome",
  "categoria",
  "sottocategoria",
  "marca",
  "parole_chiave",
  "caratteristiche",
  "descrizione",
  "descrizione_completa",
  "seo_title",
  "seo_description",
  "alt_text_immagine",
  "prezzo",
  "attivo",
  "disponibile",
  "quantita_disponibile",
  "quantita_riservata",
];

const CAMPI_NEGOZIO = ["id", "nome", "attivo", "deleted_at"];

const CAMPI_RICHIESTI = {
  id: "id",
  slug: "slug",
  negozio_id: "negozio_id",
  nome: "nome",
  categoria: "categoria",
  sottocategoria: "sottocategoria",
  marca: "marca",
  parole_chiave: "parole_chiave",
  caratteristiche: "caratteristiche",
  descrizione: "descrizione",
  descrizione_completa: "descrizione_completa",
  seo_title: "seo_title",
  seo_description: "seo_description",
  alt_text_immagine: "alt_text_immagine",
  prezzo: "prezzo",
  attivo: "attivo",
  quantita_disponibile: "quantita_disponibile",
};

function messaggioErrore(error) {
  return {
    message: error?.message ?? String(error),
    code: error?.code ?? null,
    details: error?.details ?? null,
  };
}

async function leggiTutteLeRighe(tabella, campi) {
  const righe = [];
  let totaleDichiarato = null;
  let da = 0;

  for (;;) {
    let query = db
      .from(tabella)
      .select(campi.join(","), { count: "exact" })
      .order("id", { ascending: true })
      .range(da, da + PAGINA - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(`${tabella}: ${JSON.stringify(messaggioErrore(error))}`);
    if (totaleDichiarato === null && typeof count === "number") totaleDichiarato = count;
    const pagina = data ?? [];
    righe.push(...pagina);
    if (pagina.length < PAGINA) break;
    da += PAGINA;
  }

  return { righe, totaleDichiarato };
}

function numero(valore) {
  if (valore === null || valore === undefined || valore === "") return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

function tipo(valore) {
  if (valore === null) return "null";
  if (Array.isArray(valore)) return "array";
  return typeof valore;
}

function statoCatalogo(prodotto, negozio) {
  const attivo = prodotto.attivo === true;
  const negozioPubblico = Boolean(
    negozio && negozio.attivo === true && negozio.deleted_at == null
  );
  const quantita = numero(prodotto.quantita_disponibile);
  const riservata = numero(prodotto.quantita_riservata) ?? 0;
  const disponibile =
    quantita === null ? null : quantita - riservata > 0;
  return {
    negozio_pubblico: negozioPubblico,
    attivo,
    disponibile,
    quantita_disponibile: quantita,
    quantita_riservata: riservata,
    pubblico: negozioPubblico && attivo,
  };
}

function analizzaAnomalie(prodotti, negozi, prodottiTutti, negoziTutti) {
  const ids = new Map();
  const senzaId = [];
  const senzaNegozio = [];
  const negozioNonPubblico = [];
  const prezziAnomali = [];
  const metadatiAnomali = [];
  const attivoNonBooleano = [];
  const disponibilitaAnomala = [];
  const negoziSenzaNome = [];
  const prodottiDuplicati = [];

  for (const prodotto of prodottiTutti) {
    const id = prodotto.id == null ? "" : String(prodotto.id);
    if (!id) senzaId.push(prodotto);
    else {
      const precedenti = ids.get(id) ?? [];
      precedenti.push(prodotto);
      ids.set(id, precedenti);
    }
  }
  for (const [id, righe] of ids) {
    if (righe.length > 1) prodottiDuplicati.push({ id, occorrenze: righe.length });
  }

  for (const prodotto of prodottiTutti) {
    const negozio = negoziTutti.get(String(prodotto.negozio_id ?? ""));
    if (!prodotto.negozio_id || !negozio) senzaNegozio.push(String(prodotto.id ?? ""));
    else if (!(negozio.attivo === true && negozio.deleted_at == null)) {
      negozioNonPubblico.push(String(prodotto.id ?? ""));
    }
    if (prodotto.attivo !== true && prodotto.attivo !== false) {
      attivoNonBooleano.push(String(prodotto.id ?? ""));
    }
    const prezzo = numero(prodotto.prezzo);
    if (prezzo === null || prezzo <= 0) {
      prezziAnomali.push({
        id: String(prodotto.id ?? ""),
        valore: prodotto.prezzo,
        tipo: tipo(prodotto.prezzo),
      });
    }
    if (
      (prodotto.parole_chiave != null && !Array.isArray(prodotto.parole_chiave)) ||
      (prodotto.caratteristiche != null && !Array.isArray(prodotto.caratteristiche))
    ) {
      metadatiAnomali.push({
        id: String(prodotto.id ?? ""),
        parole_chiave: tipo(prodotto.parole_chiave),
        caratteristiche: tipo(prodotto.caratteristiche),
      });
    }
    const quantita = numero(prodotto.quantita_disponibile);
    const riservata = numero(prodotto.quantita_riservata);
    if (quantita !== null && quantita < 0) {
      disponibilitaAnomala.push({ id: String(prodotto.id ?? ""), campo: "quantita_disponibile", valore: quantita });
    }
    if (riservata !== null && riservata < 0) {
      disponibilitaAnomala.push({ id: String(prodotto.id ?? ""), campo: "quantita_riservata", valore: riservata });
    }
    if (quantita !== null && riservata !== null && riservata > quantita) {
      disponibilitaAnomala.push({
        id: String(prodotto.id ?? ""),
        campo: "quantita_riservata_maggiore_di_disponibile",
        quantita,
        riservata,
      });
    }
  }

  for (const negozio of negoziTutti.values()) {
    if (!String(negozio.nome ?? "").trim()) negoziSenzaNome.push(String(negozio.id ?? ""));
  }

  const campiPresenti = new Set(Object.keys(prodottiTutti[0] ?? {}));
  const campiMancanti = Object.entries(CAMPI_RICHIESTI)
    .filter(([, colonna]) => !campiPresenti.has(colonna))
    .map(([nome, colonna]) => ({ nome, colonna }));

  return {
    campi_mancanti: campiMancanti,
    prodotti_duplicati: prodottiDuplicati,
    prodotti_senza_id: senzaId.map((p) => String(p.id ?? "")),
    prodotti_senza_negozio: senzaNegozio,
    prodotti_negozio_non_pubblico: negozioNonPubblico,
    prezzi_nulli_o_non_positivi: prezziAnomali,
    metadati_non_array: metadatiAnomali,
    attivo_non_booleano: attivoNonBooleano,
    disponibilita_anomala: disponibilitaAnomala,
    negozi_senza_nome: negoziSenzaNome,
    prodotti_totali_letti: prodottiTutti.length,
    prodotti_nello_snapshot: prodotti.length,
    negozi_totali_letti: negoziTutti.size,
    negozi_pubblici: negozi.filter((n) => n.attivo === true && n.deleted_at == null).length,
  };
}

const { righe: prodottiTutti, totaleDichiarato: totaleProdottiDichiarato } =
  await leggiTutteLeRighe("prodotti", CAMPI_PRODOTTO);
const { righe: negoziTuttiRighe, totaleDichiarato: totaleNegoziDichiarato } =
  await leggiTutteLeRighe("negozi", CAMPI_NEGOZIO);

const negoziTutti = new Map(negoziTuttiRighe.map((n) => [String(n.id), n]));
const negoziPubblici = negoziTuttiRighe.filter(
  (n) => n.attivo === true && n.deleted_at == null
);
const prodotti = prodottiTutti
  .filter((p) => {
    const n = negoziTutti.get(String(p.negozio_id ?? ""));
    return Boolean(n && n.attivo === true && n.deleted_at == null);
  })
  .map((p) => {
    const negozio = negoziTutti.get(String(p.negozio_id));
    return {
      ...p,
      negozio_nome: negozio?.nome ?? null,
      stato_catalogo: statoCatalogo(p, negozio),
    };
  });

const stati = prodotti.map((p) => p.stato_catalogo);
const conteggi = {
  prodotti_totali_letti: prodottiTutti.length,
  prodotti_totali_dichiarati_da_supabase: totaleProdottiDichiarato,
  prodotti_nello_snapshot: prodotti.length,
  prodotti_attivi: stati.filter((s) => s.attivo).length,
  prodotti_inattivi: stati.filter((s) => !s.attivo).length,
  prodotti_attivi_disponibili: stati.filter((s) => s.attivo && s.disponibile === true).length,
  prodotti_attivi_non_disponibili: stati.filter((s) => s.attivo && s.disponibile === false).length,
  prodotti_attivi_senza_quantita: stati.filter((s) => s.attivo && s.disponibile === null).length,
  prodotti_pubblici: stati.filter((s) => s.pubblico).length,
  prodotti_non_pubblici: stati.filter((s) => !s.pubblico).length,
  negozi_totali_letti: negoziTutti.size,
  negozi_totali_dichiarati_da_supabase: totaleNegoziDichiarato,
  negozi_pubblici: negoziPubblici.length,
  negozi_collegati_allo_snapshot: new Set(prodotti.map((p) => String(p.negozio_id))).size,
  negozi_pubblici_senza_prodotti: negoziPubblici.filter(
    (n) => !prodotti.some((p) => String(p.negozio_id) === String(n.id))
  ).length,
};

const anomalie = analizzaAnomalie(
  prodotti,
  negoziPubblici,
  prodottiTutti,
  negoziTutti
);

const estrazione = new Date().toISOString();
const snapshot = {
  versione: "P1.3.3",
  estrazione: {
    data_ora_utc: estrazione,
    fonte: "Supabase PostgREST",
    tabelle: ["public.prodotti", "public.negozi"],
    modalita: "sola lettura",
  },
  criteri_selezione: {
    prodotti: "tutte le righe lette; snapshot limitato ai prodotti dei negozi pubblici",
    negozi_pubblici: "attivo = true e deleted_at is null",
    stato_prodotto: "attivo, disponibile e pubblico sono riportati separatamente",
    disponibilita:
      "quantita_disponibile - quantita_riservata > 0; null = quantità non dichiarata",
  },
  schema: {
    campi_prodotti_letti: Object.keys(prodottiTutti[0] ?? {}),
    campi_negozi_letti: CAMPI_NEGOZIO,
    campi_richiesti: CAMPI_RICHIESTI,
    tipi_osservati: {
      id: tipo(prodottiTutti[0]?.id),
      prezzo: tipo(prodottiTutti[0]?.prezzo),
      attivo: tipo(prodottiTutti[0]?.attivo),
      parole_chiave: tipo(prodottiTutti[0]?.parole_chiave),
      caratteristiche: tipo(prodottiTutti[0]?.caratteristiche),
      quantita_disponibile: tipo(prodottiTutti[0]?.quantita_disponibile),
    },
  },
  conteggi,
  anomalie,
  negozi: negoziPubblici.map((n) => ({
    id: n.id,
    nome: n.nome,
    attivo: n.attivo,
    deleted_at: n.deleted_at,
  })),
  prodotti,
};

const percorso = resolve(
  process.argv[2] ??
    "scripts/pino-p1-3-3-catalog-snapshot-20261104.json"
);
const percorsoHash = `${percorso}.sha256`;
if (existsSync(percorso) || existsSync(percorsoHash)) {
  console.error(`Snapshot già esistente, nessuna sovrascrittura: ${percorso}`);
  process.exit(3);
}

const contenuto = `${JSON.stringify(snapshot, null, 2)}\n`;
writeFileSync(percorso, contenuto, "utf8");
const hash = createHash("sha256").update(contenuto, "utf8").digest("hex");
writeFileSync(percorsoHash, `${hash}  ${basename(percorso)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      snapshot: percorso,
      sha256: hash,
      conteggi,
      anomalie: {
        campi_mancanti: anomalie.campi_mancanti.length,
        prodotti_duplicati: anomalie.prodotti_duplicati.length,
        prodotti_senza_id: anomalie.prodotti_senza_id.length,
        prodotti_senza_negozio: anomalie.prodotti_senza_negozio.length,
        prodotti_negozio_non_pubblico: anomalie.prodotti_negozio_non_pubblico.length,
        prezzi_nulli_o_non_positivi: anomalie.prezzi_nulli_o_non_positivi.length,
        metadati_non_array: anomalie.metadati_non_array.length,
        attivo_non_booleano: anomalie.attivo_non_booleano.length,
        disponibilita_anomala: anomalie.disponibilita_anomala.length,
        negozi_senza_nome: anomalie.negozi_senza_nome.length,
      },
    },
    null,
    2
  )
);
