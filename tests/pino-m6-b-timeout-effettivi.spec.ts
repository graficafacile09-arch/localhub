import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  conScadenzaPino,
  ErroreTimeoutPino,
  eseguiInvocazioniPino,
  fontiInattendibiliSenzaRisultatiPino,
  mergeEsitiInvocazioniPino,
  messaggioFontiNonDisponibiliPino,
  riepilogoEsitiInvocazioniPino,
  SCADENZA_INVOCAZIONE_PINO_MS,
  type RisultatoToolPino,
  type ToolInvocation,
} from "../lib/assistente/index";

// ─── M6-B: timeout effettivi nel percorso dei tool ──────────────────────────
//
// M6-A prevedeva lo stato "timeout" ma non introduceva alcun timer: un tool
// appeso (PostgREST senza risposta, HTTP che non chiude) bloccava la richiesta
// a tempo indefinito. Qui la scadenza è reale, per singola invocazione, e
// produce lo stato "timeout" senza perdere i risultati degli altri tool.

const inv = (tool: string, params: Record<string, unknown> = {}): ToolInvocation =>
  ({ tool, params }) as unknown as ToolInvocation;

const risultato = (parti: Partial<RisultatoToolPino> = {}): RisultatoToolPino => ({
  negozi: [],
  prodotti: [],
  offerte: [],
  eventi: [],
  categorie: [],
  meteo: null,
  farmacie: [],
  ...parti,
});

const negozio = (id: string) =>
  ({ id, nome: `Negozio ${id}` }) as unknown as RisultatoToolPino["negozi"][number];
const offerta = (id: string) =>
  ({ id, titolo: `Offerta ${id}` }) as unknown as RisultatoToolPino["offerte"][number];

const appeso = (): Promise<RisultatoToolPino> => new Promise(() => undefined);
const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe("M6-B — scadenza per invocazione", () => {
  test("un tool che non risponde diventa «timeout», non «vuoto»", async () => {
    const inizio = Date.now();
    const esiti = await eseguiInvocazioniPino(
      [inv("searchStores", { query: "pane" })],
      () => appeso(),
      { scadenzaMs: 25 }
    );
    const trascorso = Date.now() - inizio;

    expect(esiti).toHaveLength(1);
    expect(esiti[0].stato).toBe("timeout");
    expect(esiti[0].risultati).toBeNull();
    expect(esiti[0].messaggio).toContain("Timeout");
    expect(trascorso).toBeLessThan(1_000);
  });

  test("una scadenza non azzera i risultati validi degli altri tool", async () => {
    const esiti = await eseguiInvocazioniPino(
      [
        inv("searchStores", { query: "pane" }),
        inv("searchOffers", { query: "sconto" }),
      ],
      async (invocazione) =>
        invocazione.tool === "searchStores"
          ? appeso()
          : risultato({ offerte: [offerta("o1")] }),
      { scadenzaMs: 25 }
    );

    expect(esiti.map((e) => e.stato)).toEqual(["timeout", "ok"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    expect(riepilogo.timeout).toBe(1);
    expect(riepilogo.erroreParziale).toBe(true);
    expect(riepilogo.tutteFallite).toBe(false);

    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(merge.offerte).toHaveLength(1);
    expect(fontiInattendibiliSenzaRisultatiPino(riepilogo, merge)).toBe(false);
  });

  test("un errore prima della scadenza resta «errore», non «timeout»", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("searchProducts", { query: "latte" })],
      () => Promise.reject(new Error("PostgREST 503")),
      { scadenzaMs: 500 }
    );
    expect(esiti[0].stato).toBe("errore");
    expect(esiti[0].messaggio).toContain("PostgREST");
  });

  test("un tool veloce non viene tagliato dalla scadenza", async () => {
    const esiti = await eseguiInvocazioniPino(
      [inv("searchStores", { query: "pane" })],
      async () => risultato({ negozi: [negozio("n1")] }),
      { scadenzaMs: 500 }
    );
    expect(esiti[0].stato).toBe("ok");
    expect(mergeEsitiInvocazioniPino(esiti).negozi).toHaveLength(1);
  });

  test("tutte le invocazioni scadute: messaggio tecnico, nessun catalogo vuoto", async () => {
    const inizio = Date.now();
    const esiti = await eseguiInvocazioniPino(
      [
        inv("searchStores", { query: "pane" }),
        inv("searchProducts", { query: "latte" }),
        inv("searchOffers", { query: "sconto" }),
      ],
      () => appeso(),
      { scadenzaMs: 25 }
    );
    const trascorso = Date.now() - inizio;

    expect(esiti.map((e) => e.stato)).toEqual(["timeout", "timeout", "timeout"]);
    const riepilogo = riepilogoEsitiInvocazioniPino(esiti);
    expect(riepilogo.tutteFallite).toBe(true);
    expect(riepilogo.erroreParziale).toBe(false);
    // Le tre scadenze corrono in parallelo: non si sommano.
    expect(trascorso).toBeLessThan(1_000);

    const merge = mergeEsitiInvocazioniPino(esiti);
    expect(fontiInattendibiliSenzaRisultatiPino(riepilogo, merge)).toBe(true);
    expect(messaggioFontiNonDisponibiliPino("it")).toContain("problema temporaneo");
  });

  test("il budget di 3 tool resta invariato con le scadenze", async () => {
    const esiti = await eseguiInvocazioniPino(
      [
        inv("searchStores", { query: "a" }),
        inv("searchProducts", { query: "b" }),
        inv("searchOffers", { query: "c" }),
      ],
      () => appeso(),
      { scadenzaMs: 20 }
    );
    expect(esiti).toHaveLength(3);
  });
});

test.describe("M6-B — classificazione del timeout", () => {
  test("ErroreTimeoutPino è riconosciuto da M6-A come timeout", async () => {
    const errore = new ErroreTimeoutPino(1_000);
    expect(errore).toBeInstanceOf(Error);
    expect(errore.name).toBe("TimeoutError");
    expect(errore.code).toBe("TIMEOUT");
    expect(errore.message).toContain("1000");

    const esiti = await eseguiInvocazioniPino(
      [inv("searchStores")],
      () => Promise.reject(errore)
    );
    expect(esiti[0].stato).toBe("timeout");
  });

  test("conScadenzaPino restituisce il valore se la promessa arriva in tempo", async () => {
    await expect(conScadenzaPino(Promise.resolve("ok"), 200)).resolves.toBe("ok");
  });

  test("conScadenzaPino rifiuta con ErroreTimeoutPino alla scadenza", async () => {
    const errore = await conScadenzaPino(appeso(), 20).catch((e: unknown) => e);
    expect(errore).toBeInstanceOf(ErroreTimeoutPino);
    expect((errore as ErroreTimeoutPino).code).toBe("TIMEOUT");
  });

  test("una promessa che si risolve dopo la scadenza non genera rifiuti non gestiti", async () => {
    const lenta = attesa(60).then(() => "tardi");
    await expect(conScadenzaPino(lenta, 10)).rejects.toBeInstanceOf(ErroreTimeoutPino);
    // Se la promessa perdente non fosse gestita, qui fallirebbe il processo.
    await attesa(80);
    await expect(conScadenzaPino(Promise.resolve("dopo"), 100)).resolves.toBe("dopo");
  });

  test("la scadenza predefinita è quella dichiarata", () => {
    expect(SCADENZA_INVOCAZIONE_PINO_MS).toBe(20_000);
  });
});

test.describe("M6-B — invarianti di codice", () => {
  const sorgente = readFileSync(join(process.cwd(), "lib/assistente/index.ts"), "utf8").replace(
    /\r\n/g,
    "\n"
  );

  test("ogni invocazione passa dalla scadenza effettiva", () => {
    expect(sorgente).toContain("const risultati = await conScadenzaPino(esegui(invocazione), scadenzaMs);");
  });

  test("la scadenza è configurabile ma con un default sicuro", () => {
    expect(sorgente).toContain("const scadenzaMs = opzioni?.scadenzaMs ?? SCADENZA_INVOCAZIONE_PINO_MS;");
  });

  test("nessun retry aggiunto nel dispatch dei tool", () => {
    expect(sorgente).not.toMatch(/for \(let tentativo[\s\S]{0,200}esegui\(invocazione\)/);
  });
});
