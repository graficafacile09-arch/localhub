import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAttivitaAdmin } from "./attivita-queries";
import { getProdottiAmministrazione } from "./prodotti";
import { getNegoziCestino } from "./negozi";
import { getUtentiReali } from "./utenti-queries";
import { getCategorieConNegozi } from "@/lib/negozi";

/**
 * Dati REALI per la pagina /amministratore/statistiche.
 * Tutti i valori provengono dal database; negozi demo e utenti di test sono
 * sempre esclusi dalle viste "piattaforma" (i demo vengono mostrati SOLO come
 * separazione esplicita nella sezione Negozi). Nessun numero inventato.
 *
 * Fonti riusate (nessuna seconda architettura):
 *   - getAttivitaAdmin            → negozi (attivi/disattivati/demo/categoria)
 *   - getNegoziCestino            → negozi nel Cestino
 *   - getProdottiAmministrazione  → prodotti (per negozio, origine, stato)
 *   - getUtentiReali              → utenti Auth (ruoli e stato)
 *   - getCategorieConNegozi       → categorie realmente usate dai negozi
 *   - scan_log (query aggregata)  → scansioni AI
 */

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

export type VoceConteggio = {
  chiave: string;
  count: number;
};

export type DatiStatistiche = {
  kpi: {
    negoziTotali: number;
    negoziAttivi: number;
    negoziDemo: number;
    negoziCestino: number;
    prodottiTotali: number;
    prodottiAttivi: number;
    prodottiAi: number;
    utentiTotali: number;
    scansioniTotali: number;
    scansioniOggi: number;
    categorieAttive: number;
  };
  negozi: {
    totale: number;
    attivi: number;
    disattivati: number;
    cestino: number;
    demo: number;
    inEvidenza: number;
    perCategoria: VoceConteggio[];
  };
  prodotti: {
    totale: number;
    attivi: number;
    ai: number;
    manuali: number;
    perNegozio: { negozioId: string; negozioNome: string; count: number }[];
  };
  utenti: {
    totale: number;
    perRuolo: VoceConteggio[];
    attivi: number;
    disattivati: number;
  };
  scansioni: {
    totale: number;
    oggi: number;
    cacheHit: number;
    perProvider: VoceConteggio[];
    perStatus: VoceConteggio[];
    andamento30gg: { data: string; etichetta: string; count: number }[];
  };
  categorie: VoceConteggio[];
  avvisi: string[];
};

function strutturaVuota(avvisi: string[] = []): DatiStatistiche {
  return {
    kpi: {
      negoziTotali: 0,
      negoziAttivi: 0,
      negoziDemo: 0,
      negoziCestino: 0,
      prodottiTotali: 0,
      prodottiAttivi: 0,
      prodottiAi: 0,
      utentiTotali: 0,
      scansioniTotali: 0,
      scansioniOggi: 0,
      categorieAttive: 0,
    },
    negozi: { totale: 0, attivi: 0, disattivati: 0, cestino: 0, demo: 0, inEvidenza: 0, perCategoria: [] },
    prodotti: { totale: 0, attivi: 0, ai: 0, manuali: 0, perNegozio: [] },
    utenti: { totale: 0, perRuolo: [], attivi: 0, disattivati: 0 },
    scansioni: { totale: 0, oggi: 0, cacheHit: 0, perProvider: [], perStatus: [], andamento30gg: [] },
    categorie: [],
    avvisi,
  };
}

function raggruppa(voce: (riga: unknown) => string | null, righe: unknown[]): Map<string, number> {
  const mappa = new Map<string, number>();
  for (const riga of righe) {
    const chiave = voce(riga);
    if (chiave !== null && chiave !== "") {
      mappa.set(chiave, (mappa.get(chiave) ?? 0) + 1);
    }
  }
  return mappa;
}

function mappaConteggi(mappa: Map<string, number>, maxVoci = 10): VoceConteggio[] {
  return Array.from(mappa.entries())
    .map(([chiave, count]) => ({ chiave, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxVoci);
}

export async function getDatiStatistiche(): Promise<DatiStatistiche> {
  const db = getDb();
  const dati = strutturaVuota();
  if (!db) {
    dati.avvisi.push("Database non configurato: le statistiche non sono disponibili.");
    return dati;
  }

  const now = new Date();
  const inizioOggi = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
  const trentaGiorniFa = new Date(
    now.getTime() - 30 * 24 * 3_600_000
  ).toISOString();

  // ── Negozi (attivita-queries: lista completa, demo incluso con flag) ──
  const [negozi, cestino, prodotti, utenti, categorieUsate, scansioni30gg, scansioniTotali, scansioniOggi] =
    await Promise.all([
      getAttivitaAdmin(),
      getNegoziCestino(),
      getProdottiAmministrazione(),
      getUtentiReali("tutti"),
      getCategorieConNegozi(),
      db
        .from("scan_log")
        .select("provider, status, cache_hit, created_at")
        .gte("created_at", trentaGiorniFa)
        .order("created_at", { ascending: false })
        .range(0, 4999),
      db.from("scan_log").select("id", { head: true, count: "exact" }),
      db.from("scan_log").select("id", { head: true, count: "exact" }).gte("created_at", inizioOggi),
    ]);

  if (scansioniTotali.error) dati.avvisi.push(`Scansioni: ${scansioniTotali.error.message}.`);
  if (scansioniOggi.error && !scansioniTotali.error) {
    dati.avvisi.push(`Scansioni odierne: ${scansioniOggi.error.message}.`);
  }

  // ── Negozi ──────────────────────────────────────────────────────────────
  const negoziReali = negozi.filter((n) => !n.is_demo);
  dati.negozi.totale = negoziReali.length;
  dati.negozi.attivi = negoziReali.filter((n) => n.attivo).length;
  dati.negozi.disattivati = negoziReali.filter((n) => !n.attivo).length;
  dati.negozi.demo = negozi.length - negoziReali.length;
  dati.negozi.cestino = cestino.length;
  dati.negozi.inEvidenza = negoziReali.filter((n) => n.in_evidenza).length;
  dati.negozi.perCategoria = mappaConteggi(
    raggruppa((n) => (n as { categoria: string | null }).categoria, negoziReali),
    8
  );

  dati.kpi.negoziTotali = dati.negozi.totale;
  dati.kpi.negoziAttivi = dati.negozi.attivi;
  dati.kpi.negoziDemo = dati.negozi.demo;
  dati.kpi.negoziCestino = dati.negozi.cestino;

  // ── Prodotti (prodotti.ts: tutti i prodotti, con negozio e origine) ─────
  dati.prodotti.totale = prodotti.length;
  dati.prodotti.attivi = prodotti.filter((p) => p.attivo).length;
  dati.prodotti.ai = prodotti.filter((p) => p.originePubblicazione === "ai").length;
  dati.prodotti.manuali = prodotti.filter((p) => p.originePubblicazione !== "ai").length;

  const perNegozio = new Map<string, { negozioNome: string; count: number }>();
  for (const p of prodotti) {
    const riga = perNegozio.get(p.negozioId) ?? { negozioNome: p.negozioNome, count: 0 };
    riga.count += 1;
    perNegozio.set(p.negozioId, riga);
  }
  dati.prodotti.perNegozio = Array.from(perNegozio.entries())
    .map(([negozioId, { negozioNome, count }]) => ({ negozioId, negozioNome, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  dati.kpi.prodottiTotali = dati.prodotti.totale;
  dati.kpi.prodottiAttivi = dati.prodotti.attivi;
  dati.kpi.prodottiAi = dati.prodotti.ai;

  // ── Utenti (utenti-queries: già senza account test) ─────────────────────
  dati.utenti.totale = utenti.length;
  dati.utenti.attivi = utenti.filter((u) => u.stato === "attivo").length;
  dati.utenti.disattivati = utenti.filter((u) => u.stato === "disattivato").length;
  dati.utenti.perRuolo = mappaConteggi(raggruppa((u) => (u as { ruolo: string }).ruolo, utenti), 5);

  dati.kpi.utentiTotali = dati.utenti.totale;

  // ── Scansioni AI (scan_log, ultimi 30 giorni + totali) ──────────────────
  const righeScansioni = (scansioni30gg.data ?? []) as {
    provider: string | null;
    status: string | null;
    cache_hit: boolean | null;
    created_at: string | null;
  }[];

  dati.scansioni.totale = scansioniTotali.count ?? 0;
  dati.scansioni.oggi = scansioniOggi.count ?? 0;
  dati.scansioni.cacheHit = righeScansioni.filter((s) => s.cache_hit).length;
  dati.scansioni.perProvider = mappaConteggi(
    raggruppa((s) => (s as { provider: string | null }).provider, righeScansioni),
    5
  );
  dati.scansioni.perStatus = mappaConteggi(
    raggruppa((s) => (s as { status: string | null }).status, righeScansioni),
    5
  );

  const chiaveLocale = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const perGiorno = new Map<string, { etichetta: string; count: number }>();
  for (let i = 29; i >= 0; i--) {
    const giorno = new Date(now.getTime() - i * 24 * 3_600_000);
    perGiorno.set(chiaveLocale(giorno), {
      etichetta: `${giorno.getDate().toString().padStart(2, "0")}/${(giorno.getMonth() + 1).toString().padStart(2, "0")}`,
      count: 0,
    });
  }
  for (const s of righeScansioni) {
    const riga = perGiorno.get(chiaveLocale(new Date(String(s.created_at))));
    if (riga) riga.count += 1;
  }
  dati.scansioni.andamento30gg = Array.from(perGiorno.entries()).map(
    ([data, { etichetta, count }]) => ({ data, etichetta, count })
  );

  dati.kpi.scansioniTotali = dati.scansioni.totale;
  dati.kpi.scansioniOggi = dati.scansioni.oggi;

  // ── Categorie (negozi.ts: solo quelle realmente usate dai negozi attivi) ─
  dati.categorie = categorieUsate
    .map(({ categoria, count }) => ({ chiave: categoria.nome, count }))
    .sort((a, b) => b.count - a.count);
  dati.kpi.categorieAttive = dati.categorie.length;

  return dati;
}