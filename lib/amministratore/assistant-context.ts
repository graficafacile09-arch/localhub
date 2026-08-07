import { getAttivitaAdmin } from "./attivita-queries";
import { getProdottiAmministrazione } from "./prodotti";
import { getNegoziCestino } from "./negozi";
import { getUtentiReali } from "./utenti-queries";
import { getCategorieConNegozi } from "@/lib/negozi";
import { getOfferteAdmin } from "@/lib/offerte";
import { getEventiAdmin } from "@/lib/eventi";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

export type AssistantContext = {
  piattaforma: {
    negoziTotali: number;
    negoziAttivi: number;
    negoziDisattivati: number;
    negoziInEvidenza: number;
    negoziCestino: number;
    negoziDemo: number;
    categorieAttive: number;
    prodottiTotali: number;
    prodottiAttivi: number;
    prodottiAi: number;
    utentiTotali: number;
    utentiAttivi: number;
    utentiDisattivati: number;
    scansioniTotali: number;
    scansioniOggi: number;
    offerteAttive: number;
    eventiAttivi: number;
  };
  negozi: Array<{
    id: string;
    nome: string;
    slug: string | null;
    categoria: string | null;
    attivo: boolean;
    inEvidenza: boolean;
    isDemo: boolean;
    prodottiCount: number;
  }>;
  categorie: Array<{ nome: string; count: number }>;
  offerte: Array<{
    id: string;
    titolo: string;
    attiva: boolean;
    negozioId: string;
    negozioNome: string | null;
    dataInizio: string | null;
    dataFine: string | null;
  }>;
  eventi: Array<{
    id: string;
    titolo: string;
    attivo: boolean;
    negozioId: string;
    negozioNome: string | null;
    dataInizio: string | null;
    dataFine: string | null;
  }>;
  prodotti: Array<{
    id: string;
    nome: string;
    negozioId: string;
    negozioNome: string;
    attivo: boolean;
    originePubblicazione: string | null;
  }>;
  utenti: Array<{
    id: string;
    email: string;
    ruolo: string;
    stato: string;
  }>;
  scansioni: {
    totale: number;
    oggi: number;
    perProvider: Array<{ chiave: string; count: number }>;
    perStatus: Array<{ chiave: string; count: number }>;
  };
};

function emptyContext(): AssistantContext {
  return {
    piattaforma: {
      negoziTotali: 0,
      negoziAttivi: 0,
      negoziDisattivati: 0,
      negoziInEvidenza: 0,
      negoziCestino: 0,
      negoziDemo: 0,
      categorieAttive: 0,
      prodottiTotali: 0,
      prodottiAttivi: 0,
      prodottiAi: 0,
      utentiTotali: 0,
      utentiAttivi: 0,
      utentiDisattivati: 0,
      scansioniTotali: 0,
      scansioniOggi: 0,
      offerteAttive: 0,
      eventiAttivi: 0,
    },
    negozi: [],
    categorie: [],
    offerte: [],
    eventi: [],
    prodotti: [],
    utenti: [],
    scansioni: { totale: 0, oggi: 0, perProvider: [], perStatus: [] },
  };
}

async function contaScansioni() {
  const db = getDb();
  if (!db) return { totale: 0, oggi: 0, perProvider: [], perStatus: [] };

  const now = new Date();
  const inizioOggi = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const trentaGiorniFa = new Date(now.getTime() - 30 * 24 * 3_600_000).toISOString();

  const [scansioni30gg, scansioniTotali, scansioniOggi] = await Promise.all([
    db.from("scan_log").select("provider, status, cache_hit, created_at").gte("created_at", trentaGiorniFa).order("created_at", { ascending: false }).range(0, 4999),
    db.from("scan_log").select("id", { head: true, count: "exact" }),
    db.from("scan_log").select("id", { head: true, count: "exact" }).gte("created_at", inizioOggi),
  ]);

  const righe = (scansioni30gg.data ?? []) as { provider: string | null; status: string | null; cache_hit: boolean | null; created_at: string | null }[];

  const mappaProvider = new Map<string, number>();
  const mappaStatus = new Map<string, number>();

  for (const s of righe) {
    if (s.provider) mappaProvider.set(s.provider, (mappaProvider.get(s.provider) ?? 0) + 1);
    if (s.status) mappaStatus.set(s.status, (mappaStatus.get(s.status) ?? 0) + 1);
  }

  return {
    totale: scansioniTotali.count ?? 0,
    oggi: scansioniOggi.count ?? 0,
    perProvider: Array.from(mappaProvider.entries()).map(([chiave, count]) => ({ chiave, count })).sort((a, b) => b.count - a.count),
    perStatus: Array.from(mappaStatus.entries()).map(([chiave, count]) => ({ chiave, count })).sort((a, b) => b.count - a.count),
  };
}

export async function getAssistantContext(): Promise<AssistantContext> {
  const ctx = emptyContext();
  const db = getDb();
  if (!db) return ctx;

  try {
    const [attivita, cestino, prodotti, utenti, categorieUsate, offerte, eventi, scansioni] = await Promise.all([
      getAttivitaAdmin(),
      getNegoziCestino(),
      getProdottiAmministrazione(),
      getUtentiReali("tutti"),
      getCategorieConNegozi(),
      getOfferteAdmin({}),
      getEventiAdmin({}),
      contaScansioni(),
    ]);

    const negoziReali = attivita.filter((n) => !n.is_demo);
    const negoziDemo = attivita.filter((n) => n.is_demo);

    // Piattaforma
    ctx.piattaforma.negoziTotali = negoziReali.length;
    ctx.piattaforma.negoziAttivi = negoziReali.filter((n) => n.attivo).length;
    ctx.piattaforma.negoziDisattivati = negoziReali.filter((n) => !n.attivo).length;
    ctx.piattaforma.negoziInEvidenza = negoziReali.filter((n) => n.in_evidenza).length;
    ctx.piattaforma.negoziCestino = cestino.length;
    ctx.piattaforma.negoziDemo = negoziDemo.length;
    ctx.piattaforma.categorieAttive = categorieUsate.length;

    ctx.piattaforma.prodottiTotali = prodotti.length;
    ctx.piattaforma.prodottiAttivi = prodotti.filter((p) => p.attivo).length;
    ctx.piattaforma.prodottiAi = prodotti.filter((p) => p.originePubblicazione === "ai").length;

    ctx.piattaforma.utentiTotali = utenti.length;
    ctx.piattaforma.utentiAttivi = utenti.filter((u) => u.stato === "attivo").length;
    ctx.piattaforma.utentiDisattivati = utenti.filter((u) => u.stato === "disattivato").length;

    ctx.piattaforma.scansioniTotali = scansioni.totale;
    ctx.piattaforma.scansioniOggi = scansioni.oggi;
    ctx.piattaforma.offerteAttive = offerte.filter((o) => o.attiva).length;
    ctx.piattaforma.eventiAttivi = eventi.filter((e) => e.attivo).length;

    // Negozi
    ctx.negozi = negoziReali.map((n) => ({
      id: n.id,
      nome: n.nome,
      slug: n.slug,
      categoria: n.categoria,
      attivo: n.attivo,
      inEvidenza: n.in_evidenza,
      isDemo: n.is_demo,
      prodottiCount: n.prodotti ?? 0,
    }));

    // Categorie
    ctx.categorie = categorieUsate.map(({ categoria, count }) => ({ nome: categoria.nome, count })).sort((a, b) => b.count - a.count);

    // Offerte
    ctx.offerte = offerte.map((o) => ({
      id: o.id,
      titolo: o.titolo,
      attiva: o.attiva,
      negozioId: o.negozio_id,
      negozioNome: o.negozio_nome,
      dataInizio: o.data_inizio,
      dataFine: o.data_fine,
    }));

    // Eventi
    ctx.eventi = eventi.map((e) => ({
      id: e.id,
      titolo: e.titolo,
      attivo: e.attivo,
      negozioId: e.negozio_id,
      negozioNome: e.negozio_nome,
      dataInizio: e.data_inizio,
      dataFine: e.data_fine,
    }));

    // Prodotti
    ctx.prodotti = prodotti.map((p) => ({
      id: p.id,
      nome: p.nome,
      negozioId: p.negozioId,
      negozioNome: p.negozioNome,
      attivo: p.attivo,
      originePubblicazione: p.originePubblicazione,
    }));

    // Utenti
    ctx.utenti = utenti.map((u) => ({
      id: u.id,
      email: u.email,
      ruolo: u.ruolo,
      stato: u.stato,
    }));

    // Scansioni
    ctx.scansioni = scansioni;

  } catch {
    // In caso di errore, ritorna contesto vuoto
  }

  return ctx;
}

export function buildContextSummary(ctx: AssistantContext): string {
  const p = ctx.piattaforma;
  const lines: string[] = [];

  lines.push("=== CONTESTO PIATTAFORMA IN CITTÀ ===");
  lines.push("");
  lines.push("KPI PRINCIPALI:");
  lines.push(`- Negozi totali (reali): ${p.negoziTotali} (attivi: ${p.negoziAttivi}, disattivati: ${p.negoziDisattivati}, in evidenza: ${p.negoziInEvidenza})`);
  lines.push(`- Negozi demo: ${p.negoziDemo}`);
  lines.push(`- Negozi nel cestino: ${p.negoziCestino}`);
  lines.push(`- Categorie attive: ${p.categorieAttive}`);
  lines.push(`- Prodotti totali: ${p.prodottiTotali} (attivi: ${p.prodottiAttivi}, generati da AI: ${p.prodottiAi})`);
  lines.push(`- Utenti totali: ${p.utentiTotali} (attivi: ${p.utentiAttivi}, disattivati: ${p.utentiDisattivati})`);
  lines.push(`- Scansioni AI totali: ${p.scansioniTotali} (oggi: ${p.scansioniOggi})`);
  lines.push(`- Offerte attive: ${p.offerteAttive}`);
  lines.push(`- Eventi attivi: ${p.eventiAttivi}`);
  lines.push("");

  if (ctx.categorie.length > 0) {
    lines.push("CATEGORIE PIÙ USATE:");
    for (const c of ctx.categorie.slice(0, 10)) {
      lines.push(`- ${c.nome}: ${c.count} negozi`);
    }
    lines.push("");
  }

  if (ctx.negozi.length > 0) {
    lines.push("NEGOZI IN EVIDENZA:");
    for (const n of ctx.negozi.filter((n) => n.inEvidenza).slice(0, 10)) {
      lines.push(`- ${n.nome} (${n.categoria ?? "senza categoria"}, ${n.prodottiCount} prodotti)`);
    }
    lines.push("");

    lines.push("NEGOZI DISATTIVATI:");
    for (const n of ctx.negozi.filter((n) => !n.attivo).slice(0, 10)) {
      lines.push(`- ${n.nome} (${n.categoria ?? "senza categoria"}, ${n.prodottiCount} prodotti)`);
    }
    lines.push("");

    lines.push("NEGOZI CON MENO PRODOTTI (min 1):");
    for (const n of ctx.negozi.filter((n) => n.prodottiCount > 0 && n.prodottiCount < 5).slice(0, 10)) {
      lines.push(`- ${n.nome}: ${n.prodottiCount} prodotti`);
    }
    lines.push("");
  }

  if (ctx.offerte.length > 0) {
    lines.push("OFFERTE ATTIVE:");
    for (const o of ctx.offerte.filter((o) => o.attiva).slice(0, 10)) {
      const fine = o.dataFine ? ` (scade: ${o.dataFine})` : "";
      lines.push(`- "${o.titolo}" → ${o.negozioNome ?? "negozio sconosciuto"}${fine}`);
    }
    lines.push("");

    lines.push("OFFERTE IN SCADENZA (prossimi 7 giorni):");
    const now = new Date();
    const settimanaProssima = new Date(now.getTime() + 7 * 24 * 3_600_000);
    for (const o of ctx.offerte.filter((o) => o.attiva && o.dataFine && new Date(o.dataFine) <= settimanaProssima).slice(0, 10)) {
      lines.push(`- "${o.titolo}" → ${o.negozioNome ?? "negozio sconosciuto"} (scade: ${o.dataFine})`);
    }
    lines.push("");
  }

  if (ctx.eventi.length > 0) {
    lines.push("EVENTI ATTIVI:");
    for (const e of ctx.eventi.filter((e) => e.attivo).slice(0, 10)) {
      const inizio = e.dataInizio ? ` (dal: ${e.dataInizio})` : "";
      const fine = e.dataFine ? ` → al: ${e.dataFine}` : "";
      lines.push(`- "${e.titolo}" → ${e.negozioNome ?? "negozio sconosciuto"}${inizio}${fine}`);
    }
    lines.push("");

    lines.push("EVENTI PROSSIMI (prossimi 30 giorni):");
    const now = new Date();
    const meseProssimo = new Date(now.getTime() + 30 * 24 * 3_600_000);
    for (const e of ctx.eventi.filter((e) => e.attivo && e.dataInizio && new Date(e.dataInizio) >= now && new Date(e.dataInizio) <= meseProssimo).slice(0, 10)) {
      lines.push(`- "${e.titolo}" → ${e.negozioNome ?? "negozio sconosciuto"} (inizia: ${e.dataInizio})`);
    }
    lines.push("");
  }

  if (ctx.prodotti.length > 0) {
    lines.push("PRODOTTI (ultimi 20):");
    for (const p of ctx.prodotti.slice(0, 20)) {
      lines.push(`- "${p.nome}" → ${p.negozioNome} (${p.attivo ? "attivo" : "disattivato"}, origine: ${p.originePubblicazione ?? "sconosciuta"})`);
    }
    lines.push("");
  }

  if (ctx.utenti.length > 0) {
    lines.push("UTENTI PER RUOLO:");
    const perRuolo = new Map<string, number>();
    for (const u of ctx.utenti) {
      perRuolo.set(u.ruolo, (perRuolo.get(u.ruolo) ?? 0) + 1);
    }
    for (const [ruolo, count] of Array.from(perRuolo.entries()).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${ruolo}: ${count}`);
    }
    lines.push("");
  }

  if (ctx.scansioni.totale > 0) {
    lines.push("SCANSIONI AI:");
    lines.push(`- Totali: ${ctx.scansioni.totale}, Oggi: ${ctx.scansioni.oggi}`);
    if (ctx.scansioni.perProvider.length > 0) {
      lines.push("  Per provider:");
      for (const s of ctx.scansioni.perProvider.slice(0, 5)) {
        lines.push(`  - ${s.chiave}: ${s.count}`);
      }
    }
    if (ctx.scansioni.perStatus.length > 0) {
      lines.push("  Per status:");
      for (const s of ctx.scansioni.perStatus.slice(0, 5)) {
        lines.push(`  - ${s.chiave}: ${s.count}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}