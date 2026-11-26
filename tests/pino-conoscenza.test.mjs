import assert from "node:assert/strict";
import test from "node:test";
import { suddividiTesto, hashTesto, pulisciTesto } from "../lib/conoscenza/testo.ts";
import { vociDaPagine, urlCanonico } from "../lib/conoscenza/fonti.ts";
import {
  pianificaAggiornamento,
  soloAttive,
  conHash,
  leggiTutteLePagine,
} from "../lib/conoscenza/sincronizzazione.ts";

const voce = (chiave, testo = "testo") => ({
  chiave,
  sezione: "pagina",
  percorso: "/x",
  titolo: "T",
  testo,
});

test("urlCanonico costruisce URL assoluti senza doppio slash", () => {
  assert.equal(urlCanonico("https://www.incitta.online/", "/territorio/x"), "https://www.incitta.online/territorio/x");
  assert.equal(urlCanonico("https://www.incitta.online", "stagionalita#clementine"), "https://www.incitta.online/stagionalita#clementine");
});

test("pulisciTesto rimuove markup e normalizza spazi", () => {
  assert.equal(pulisciTesto("<p>Ciao  **mondo**</p>\n\n"), "Ciao mondo");
});

test("suddividiTesto rispetta il limite e spezza sulle frasi", () => {
  const frase = "Frase di prova abbastanza lunga.";
  const testo = Array(10).fill(frase).join(" ");
  const blocchi = suddividiTesto(testo, 80);
  assert.ok(blocchi.length > 1);
  for (const b of blocchi) assert.ok(b.length <= 80, `blocco troppo lungo: ${b.length}`);
  assert.equal(blocchi.join(" ").replace(/\s+/g, " "), testo.replace(/\s+/g, " "));
});

test("suddividiTesto spezza una frase più lunga del limite senza perdere testo", () => {
  const lunga = "a".repeat(250);
  const blocchi = suddividiTesto(lunga, 100);
  assert.deepEqual(blocchi.map((b) => b.length), [100, 100, 50]);
});

test("suddividiTesto restituisce array vuoto per testo vuoto", () => {
  assert.deepEqual(suddividiTesto("   "), []);
});

test("hashTesto è stabile e cambia con il contenuto", () => {
  assert.equal(hashTesto("ciao"), hashTesto("ciao"));
  assert.notEqual(hashTesto("ciao"), hashTesto("ciao!"));
});

test("vociDaPagine conserva il percorso canonico e chiavi uniche per blocco", () => {
  const voci = vociDaPagine([
    { sezione: "territorio", percorso: "/territorio/castrovillari", titolo: "Castrovillari", testi: ["Uno.", "Due."] },
  ]);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].percorso, "/territorio/castrovillari");
  assert.equal(voci[0].chiave, "territorio:/territorio/castrovillari#0");
});

test("urlCanonico costruisce un URL assoluto senza doppi slash", () => {
  assert.equal(urlCanonico("https://www.incitta.online/", "/faq"), "https://www.incitta.online/faq");
  assert.equal(urlCanonico("https://www.incitta.online", "faq"), "https://www.incitta.online/faq");
});

test("prima sincronizzazione inserisce tutte le voci", () => {
  const piano = pianificaAggiornamento({ ok: true, completa: true, voci: [voce("a"), voce("b")] }, []);
  assert.equal(piano.sicuro, true);
  assert.equal(piano.daScrivere.length, 2);
  assert.deepEqual(piano.daRimuovere, []);
});

test("voce con hash invariato non viene riscritta", () => {
  const [gia] = conHash([voce("a", "stesso")]);
  const piano = pianificaAggiornamento(
    { ok: true, completa: true, voci: [voce("a", "stesso")] },
    [{ chiave: "a", hash: gia.hash, stato: "attivo" }]
  );
  assert.deepEqual(piano.daScrivere, []);
});

test("voce con testo cambiato viene riscritta", () => {
  const piano = pianificaAggiornamento(
    { ok: true, completa: true, voci: [voce("a", "nuovo")] },
    [{ chiave: "a", hash: "vecchio", stato: "attivo" }]
  );
  assert.equal(piano.daScrivere.length, 1);
});

test("errore di scansione non produce alcuna scrittura né rimozione", () => {
  const piano = pianificaAggiornamento(
    { ok: false, errore: "timeout" },
    [{ chiave: "a", hash: "h", stato: "attivo" }]
  );
  assert.equal(piano.sicuro, false);
  assert.deepEqual(piano.daRimuovere, []);
  assert.deepEqual(piano.daScrivere, []);
});

test("scansione completa vuota non cancella mai voci attive", () => {
  const piano = pianificaAggiornamento(
    { ok: true, completa: true, voci: [] },
    [{ chiave: "a", hash: "h", stato: "attivo" }]
  );
  assert.equal(piano.sicuro, false);
  assert.deepEqual(piano.daRimuovere, []);
  assert.deepEqual(piano.daScrivere, []);
});

test("scansione non dimostrata completa non rimuove nulla, anche se ha voci", () => {
  const archiviate = ["a", "b", "c", "d"].map((c) => ({ chiave: c, hash: "h", stato: "attivo" }));
  const piano = pianificaAggiornamento({ ok: true, voci: [voce("a")] }, archiviate);
  assert.equal(piano.sicuro, false);
  assert.deepEqual(piano.daRimuovere, []);
  assert.deepEqual(piano.daScrivere, []);
});

test("scansione ridotta ma completa rimuove solo le voci davvero assenti", () => {
  const archiviate = ["a", "b", "c", "d"].map((c) => ({ chiave: c, hash: "h", stato: "attivo" }));
  const piano = pianificaAggiornamento({ ok: true, completa: true, voci: [voce("a")] }, archiviate);
  assert.equal(piano.sicuro, true);
  assert.deepEqual(piano.daRimuovere, ["b", "c", "d"]);
});

test("voce assente da una scansione completa viene rimossa logicamente", () => {
  const archiviate = ["a", "b", "c"].map((c) => ({ chiave: c, hash: "h", stato: "attivo" }));
  const piano = pianificaAggiornamento(
    { ok: true, completa: true, voci: [voce("a", "x"), voce("b", "y")] },
    archiviate
  );
  assert.equal(piano.sicuro, true);
  assert.deepEqual(piano.daRimuovere, ["c"]);
});

/** Sorgente paginata finta: `righe` è l'elenco vero, `falliA` la pagina che fallisce. */
function sorgente({ righe, totale = righe.length, falliA = -1, totaleVariaA = -1 }) {
  const letture = [];
  const leggi = async (da, a) => {
    letture.push(da);
    if (da === falliA) return { righe: [], totale: null, errore: "timeout" };
    const tot = da === totaleVariaA ? totale + 1 : totale;
    return { righe: righe.slice(da, a + 1), totale: tot };
  };
  return { leggi, letture };
}

test("lettura paginata completa restituisce tutte le righe", async () => {
  const righe = Array.from({ length: 7 }, (_, i) => i);
  const s = sorgente({ righe });
  assert.deepEqual(await leggiTutteLePagine(s.leggi, 3), righe);
  assert.deepEqual(s.letture, [0, 3, 6]);
});

test("lettura paginata con totale esatto multiplo della pagina termina correttamente", async () => {
  const righe = Array.from({ length: 6 }, (_, i) => i);
  const s = sorgente({ righe });
  assert.deepEqual(await leggiTutteLePagine(s.leggi, 3), righe);
});

test("interruzione dopo diverse pagine lancia errore e non restituisce lista parziale", async () => {
  const righe = Array.from({ length: 10 }, (_, i) => i);
  const s = sorgente({ righe, falliA: 6 });
  await assert.rejects(leggiTutteLePagine(s.leggi, 3), /lettura interrotta a 6/);
  assert.deepEqual(s.letture, [0, 3, 6]);
});

test("totale non dichiarato rende la completezza non dimostrabile", async () => {
  const leggi = async () => ({ righe: [1, 2], totale: null });
  await assert.rejects(leggiTutteLePagine(leggi, 2), /totale non dichiarato/);
});

test("totale che cambia tra le pagine fa fallire la lettura", async () => {
  const righe = Array.from({ length: 7 }, (_, i) => i);
  const s = sorgente({ righe, totaleVariaA: 3 });
  await assert.rejects(leggiTutteLePagine(s.leggi, 3), /totale cambiato/);
});

test("righe lette diverse dal totale dichiarato fanno fallire la lettura", async () => {
  // Totale dichiarato 5, ma la sorgente restituisce solo 3 righe in tutto.
  const leggi = async (da) => ({
    righe: da === 0 ? [1, 2] : [3],
    totale: 5,
  });
  await assert.rejects(leggiTutteLePagine(leggi, 2), /lettura incompleta/);
});

test("archivio letto in parte non produce rimozioni: l'errore blocca il piano a monte", async () => {
  const archiviate = ["a", "b", "c", "d"].map((c) => ({ chiave: c, hash: "h", stato: "attivo" }));
  // Pagine da 2: inizi 0, 2, 4. La seconda pagina (da 2) fallisce.
  const s = sorgente({ righe: archiviate, falliA: 2 });
  await assert.rejects(leggiTutteLePagine(s.leggi, 2), /lettura interrotta a 2/);
  // Nessuna lista parziale viene restituita: il chiamante non scrive né rimuove.
});

test("voce rimossa che torna presente viene riattivata", () => {
  const piano = pianificaAggiornamento(
    { ok: true, completa: true, voci: [voce("a", "x")] },
    [{ chiave: "a", hash: conHash([voce("a", "x")])[0].hash, stato: "rimosso" }]
  );
  assert.deepEqual(piano.daRiattivare, ["a"]);
  assert.equal(piano.daScrivere.length, 1);
});

test("i risultati di ricerca escludono le voci rimosse", () => {
  const risultati = [{ chiave: "a" }, { chiave: "b" }];
  const filtrati = soloAttive(risultati, [{ chiave: "b", hash: "h", stato: "rimosso" }]);
  assert.deepEqual(filtrati, [{ chiave: "a" }]);
});
