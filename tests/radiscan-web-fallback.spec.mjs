import test from "node:test";
import assert from "node:assert/strict";

const radiscan = await import("@/lib/radiscan");
const { creaRicercaWeb, svuotaCacheWeb, estraiRisultatiBing, urlBing } = radiscan;

function riconoscimento() {
  return {
    prodotto: "Caciocavallo Silano",
    categoria: "Formaggi",
    denominazioneProposta: "Caciocavallo Silano DOP",
    territorioProposto: "Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 80,
    note: null,
    incongruenzeRilevate: [],
  };
}

// URL reale osservato nelle risposte Bing: /ck/a?...&u=a1<base64url>.
const DESTINAZIONE = "https://www.masaf.gov.it/registro-dop";
const BASE64URL = Buffer.from(DESTINAZIONE, "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

function paginaBing() {
  return `<html><body><ol id="b_results">
    <li class="b_algo" data-id iid=SERP.1>
      <h2><a target="_blank" href="https://www.bing.com/ck/a?!&amp;&amp;p=x&amp;u=a1${BASE64URL}&amp;ntb=1">MASAF — Registro nazionale</a></h2>
      <p class="b_lineclamp2">Scheda ufficiale del Caciocavallo Silano DOP.</p>
    </li>
  </ol></body></html>`;
}

test("web: decodifica i redirect Bing in URL https reali", () => {
  assert.equal(
    urlBing(`https://www.bing.com/ck/a?!&&p=x&u=a1${BASE64URL}&ntb=1`),
    DESTINAZIONE
  );
  assert.equal(urlBing("https://www.bing.com/ck/a?!&&u=a1%%%"), null);
  assert.equal(urlBing("http://www.masaf.gov.it/x"), null);
});

test("web: se DuckDuckGo risponde 202 si usa Bing come fallback", async () => {
  svuotaCacheWeb();
  const chiamate = [];
  const provider = creaRicercaWeb({
    leggiPagineUfficiali: false,
    fetchImpl: async (url) => {
      chiamate.push(String(url));
      if (String(url).includes("duckduckgo.com")) {
        return new Response("<html>challenge</html>", { status: 202 });
      }
      return new Response(paginaBing(), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    adesso: () => new Date("2026-11-20T10:00:00Z"),
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  assert.ok(esito.fonti.some((fonte) => fonte.url === DESTINAZIONE));
  assert.ok(chiamate.some((url) => url.includes("www.bing.com/search")));
  const masaf = esito.fonti.find((fonte) => fonte.url === DESTINAZIONE);
  assert.equal(masaf.natura, "ufficiale_it");
  assert.equal(masaf.attendibilita, "alta");
});

test("web: se i motori generalisti sono KO si usa Wikipedia strutturata", async () => {
  svuotaCacheWeb();
  const provider = creaRicercaWeb({
    leggiPagineUfficiali: false,
    fetchImpl: async (url) => {
      if (String(url).includes("api.php")) {
        return new Response(
          JSON.stringify({
            query: {
              search: [
                { title: "Caciocavallo Silano", snippet: "Formaggio <b>DOP</b> della Calabria" },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("", { status: 503 });
    },
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(esito.stato, "ok");
  const wiki = esito.fonti.find((fonte) => fonte.dominio === "it.wikipedia.org");
  assert.ok(wiki);
  assert.equal(wiki.natura, "informativo");
  assert.match(wiki.estratto, /Formaggio DOP/);
});

test("web: entrambi i motori KO restano non_disponibile", async () => {
  svuotaCacheWeb();
  const esito = await creaRicercaWeb({
    fetchImpl: async () => new Response("", { status: 503 }),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "non_disponibile");
  assert.deepEqual(esito.fonti, []);
});

test("web: il parser Bing ignora blocchi senza link validi", () => {
  const risultati = estraiRisultatiBing(
    `<li class="b_algo"><h2><a href="https://127.0.0.1/x">Locale</a></h2><p>no</p></li>`
  );
  assert.deepEqual(risultati, []);
});
