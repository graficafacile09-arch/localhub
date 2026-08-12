/**
 * Test FASE F2.4 — Carrello client-side (logica PURA, nessun browser/DB).
 *
 * Copre: aggiunta, incremento stessa combinazione, varianti diverse,
 * prodotti senza varianti, clamp quantità 1–99, rimozione, svuotamento,
 * persistenza dopo reload (localStorage simulato), raggruppamento
 * multi-negozio con subtotali e totale, buy-now invariato (verifica
 * statica dei link ACQUISTA).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggiungiAlCarrello,
  aggiornaQuantita,
  chiaveRiga,
  contaPezzi,
  deserializzaCarrello,
  leggiCarrello,
  QUANTITA_MAX,
  QUANTITA_MIN,
  raggruppaPerNegozio,
  rimuoviDalCarrello,
  serializzaCarrello,
  subtotaleRighe,
  svuotaCarrello,
  totaleCarrello,
  scriviCarrello,
  type RigaCarrello,
  type RigaInserimento,
} from "../lib/carrello/cart-core";

let passati = 0;
let falliti = 0;
const errori: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: string) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    errori.push(nome);
    console.log(`  ❌ ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  }
}

function euro(v: number) {
  return Math.round(v * 100) / 100;
}

// ── Fabbrica righe ──────────────────────────────────────────────────────────
let seq = 0;
function rigaBase(over: Partial<RigaInserimento> = {}): RigaInserimento {
  seq++;
  return {
    prodottoId: `prod-${seq}`,
    varianteId: null,
    quantita: 1,
    nome: `Prodotto ${seq}`,
    prezzo: 10,
    immagine: `/img-${seq}.jpg`,
    variante: null,
    negozioId: "negozio-A",
    negozioNome: "Negozio A",
    slug: `prodotto-${seq}`,
    ...over,
  };
}

// ── Storage in-memory per simulare localStorage ─────────────────────────────
function storageMemoria(): {
  storage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
  dump: () => string | null;
} {
  const mappa = new Map<string, string>();
  return {
    storage: {
      getItem: (k) => mappa.get(k) ?? null,
      setItem: (k, v) => void mappa.set(k, v),
      removeItem: (k) => void mappa.delete(k),
    },
    dump: () => mappa.get("localhub.carrello.v1") ?? null,
  };
}

console.log("\n🧪 F2.4 — CARRELLO CLIENT-SIDE (logica pura)\n");

// ── T1. Aggiunta ────────────────────────────────────────────────────────────
console.log("\n[T1] Aggiunta");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ quantita: 2 }));
  check("aggiunta crea una riga", carrello.length === 1);
  check("quantità rispettata", carrello[0].quantita === 2);
  check("snapshot nome/prezzo/negozio salvato", carrello[0].nome === "Prodotto 1" && carrello[0].prezzo === 10 && carrello[0].negozioId === "negozio-A");
  check("pezzi totali = 2", contaPezzi(carrello) === 2);
}

// ── T2. Incremento stessa combinazione prodotto+variante ────────────────────
console.log("\n[T2] Incremento stessa combinazione");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "p1", varianteId: "v1", quantita: 1 }));
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "p1", varianteId: "v1", quantita: 3 }));
  check("stessa combinazione → 1 riga", carrello.length === 1);
  check("quantità incrementata a 4", carrello[0].quantita === 4);
  check("chiave riga stabile", chiaveRiga("p1", "v1") === "p1::v1");
}

// ── T3. Varianti diverse → righe separate ───────────────────────────────────
console.log("\n[T3] Varianti diverse dello stesso prodotto");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "p1", varianteId: "v1", variante: "Taglia M", prezzo: 12 }));
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "p1", varianteId: "v2", variante: "Taglia L", prezzo: 14 }));
  check("2 righe separate", carrello.length === 2);
  check("snapshot variante diverso", carrello[0].variante === "Taglia M" && carrello[1].variante === "Taglia L");
  check("prezzi snapshot rispettati", carrello[0].prezzo === 12 && carrello[1].prezzo === 14);
  check("totale = 12+14 = 26", totaleCarrello(carrello) === 26);
}

// ── T4. Prodotti senza varianti ─────────────────────────────────────────────
console.log("\n[T4] Prodotti senza varianti");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "p9", varianteId: null }));
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "p9", varianteId: null, quantita: 1 }));
  check("senza variante → chiave base condivisa", carrello.length === 1 && carrello[0].quantita === 2);
  check("chiave base = p9::base", chiaveRiga("p9", null) === "p9::base");
}

// ── T5. Clamp quantità 1–99 ─────────────────────────────────────────────────
console.log("\n[T5] Quantità min 1 / max 99");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ quantita: 100 }));
  check("aggiunta oltre 99 clampata a 99", carrello[0].quantita === QUANTITA_MAX);
  carrello = aggiungiAlCarrello(carrello, rigaBase({ quantita: 0 }));
  check("aggiunta sotto 1 clampata a 1", carrello[1].quantita === QUANTITA_MIN);

  const chiave = chiaveRiga(carrello[0].prodottoId, null);
  carrello = aggiornaQuantita(carrello, chiave, 500);
  check("aggiorna sopra 99 clampata a 99", carrello[0].quantita === 99);
  carrello = aggiornaQuantita(carrello, chiave, -3);
  check("aggiorna a 0/-n → riga rimossa", !carrello.some((r) => chiaveRiga(r.prodottoId, null) === chiave));
}

// ── T6. Rimozione e svuotamento ─────────────────────────────────────────────
console.log("\n[T6] Rimozione e svuotamento");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "a" }));
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "b" }));
  carrello = rimuoviDalCarrello(carrello, chiaveRiga("a", null));
  check("rimozione riga", carrello.length === 1 && carrello[0].prodottoId === "b");
  carrello = svuotaCarrello();
  check("svuotamento", carrello.length === 0 && contaPezzi(carrello) === 0);
}

// ── T7. Persistenza dopo reload ─────────────────────────────────────────────
console.log("\n[T7] Persistenza dopo reload (localStorage)");
{
  const { storage, dump } = storageMemoria();
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "pA", varianteId: "vX", variante: "Rosso", quantita: 3, prezzo: 9.5 }));
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "pB", varianteId: null, quantita: 1, prezzo: 2.25 }));
  scriviCarrello(storage, carrello);
  check("storage scritto con versione", (dump() ?? "").includes('"versione":1'));

  // Simula il reload: nuova lettura dallo storage.
  const ripristinato = leggiCarrello(storage);
  check("righe ripristinate dopo reload", ripristinato.length === 2);
  check("quantità e prezzi preservati", ripristinato[0].quantita === 3 && ripristinato[0].prezzo === 9.5);
  check("variante e snapshot preservati", ripristinato[0].variante === "Rosso" && ripristinato[1].varianteId === null);

  // Storage sporco → carrello vuoto senza crash.
  const rotto = { getItem: () => "{not-json", setItem: () => {}, removeItem: () => {} };
  check("storage corrotto → vuoto, nessun crash", leggiCarrello(rotto).length === 0);

  // Versione futura → ignorata.
  const futura = { ...storage, getItem: () => '{"versione":999,"righe":[]}' };
  check("versione futura → vuoto", leggiCarrello(futura).length === 0);
}

// ── T8. Raggruppamento multi-negozio + subtotali + totale ───────────────────
console.log("\n[T8] Raggruppamento multi-negozio");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "1", negozioId: "nA", negozioNome: "Negozio A", prezzo: 10, quantita: 2 }));
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "2", negozioId: "nA", negozioNome: "Negozio A", prezzo: 5, quantita: 1 }));
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "3", negozioId: "nB", negozioNome: "Negozio B", prezzo: 7, quantita: 3 }));

  const gruppi = raggruppaPerNegozio(carrello);
  check("2 gruppi negozio", gruppi.length === 2);
  const a = gruppi.find((g) => g.negozioId === "nA")!;
  const b = gruppi.find((g) => g.negozioId === "nB")!;
  check("gruppo A: 2 righe, subtotale 25", a.righe.length === 2 && a.subtotale === 25);
  check("gruppo B: 1 riga, subtotale 21", b.righe.length === 1 && b.subtotale === 21);
  check("totale complessivo 46", totaleCarrello(carrello) === 46);
  check("subtotaleRighe arrotonda a 2 decimali", euro(subtotaleRighe([{ prezzo: 10.005, quantita: 1 } as RigaCarrello])) === 10.01);
}

// ── T9. Serializzazione round-trip ──────────────────────────────────────────
console.log("\n[T9] Serializzazione round-trip + righe invalide scartate");
{
  let carrello: RigaCarrello[] = [];
  carrello = aggiungiAlCarrello(carrello, rigaBase({ prodottoId: "x", quantita: 4 }));
  const raw = serializzaCarrello(carrello);
  const ricaricato = deserializzaCarrello(raw);
  check("round-trip identico", ricaricato.length === 1 && ricaricato[0].quantita === 4);

  const conInvalidi = '{"versione":1,"righe":[' +
    '{"prodottoId":"ok","varianteId":null,"quantita":2,"nome":"Ok","prezzo":1,"immagine":null,"variante":null,"negozioId":"n","negozioNome":"N","slug":"ok"},' +
    '{"prodottoId":123,"quantita":"x"}' +
    "]}";
  const filtrati = deserializzaCarrello(conInvalidi);
  check("riga invalida scartata", filtrati.length === 1 && filtrati[0].prodottoId === "ok");
}

// ── T10. Buy-now invariato (verifica statica dei sorgenti) ──────────────────
console.log("\n[T10] Buy-now ACQUISTA invariato (verifica statica)");
{
  const selettore = readFileSync(join(process.cwd(), "components/prodotto/ProductVariantSelector.tsx"), "utf8");
  const pagina = readFileSync(join(process.cwd(), "app/prodotto/[slug]/page.tsx"), "utf8");

  check(
    "selettore: ACQUISTA resta un Link con varianteId nell'URL",
    /href=\{hrefAcquista\}/.test(selettore) &&
      /\/prodotto\/\$\{slug\}\/acquista\?varianteId=/.test(selettore)
  );
  check(
    "pagina legacy: ACQUISTA resta Link a /prodotto/{slug}/acquista",
    /href=\{`\/prodotto\/\$\{prodotto\.slug\}\/acquista`\}/.test(pagina)
  );
  check("pagina: Aggiungi al carrello presente (legacy)", pagina.includes("AggiungiAlCarrelloButton"));
  check("selettore: Aggiungi al carrello presente (varianti)", selettore.includes("AggiungiAlCarrelloButton"));
  check(
    "nessuna modifica al flusso /acquista: nessun riferimento checkout nel core",
    !readFileSync(join(process.cwd(), "lib/carrello/cart-core.ts"), "utf8").includes("/acquista")
  );
}

// ── Riepilogo ───────────────────────────────────────────────────────────────
console.log("\n──────────────────────────────────────────────");
console.log(`F2.4: ${passati} PASS / ${falliti} FAIL`);
if (falliti > 0) {
  console.log("Errori:\n  - " + errori.join("\n  - "));
  process.exit(1);
}
console.log("TUTTI I TEST SUPERATI ✅");
