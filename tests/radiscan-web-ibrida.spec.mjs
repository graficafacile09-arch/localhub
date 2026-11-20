import test from "node:test";
import assert from "node:assert/strict";

const { creaRicercaWebIbrida } = await import("@/lib/radiscan");

function riconoscimento() {
  return {
    prodotto: "Soppressata di Calabria",
    categoria: "Salumi",
    denominazioneProposta: "Soppressata di Calabria DOP",
    territorioProposto: "Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 85,
    note: null,
    incongruenzeRilevate: [],
    produttore: "Madeo",
  };
}

function pagina(titolo, testo) {
  return `<html><head><title>${titolo}</title></head><body><main>${testo}</main></body></html>`;
}

const URL_MADEO = "https://www.filieramadeo.it/";
const URL_MASAF = "https://www.masaf.gov.it/soppressata-calabria-dop";
const PAGINE = {
  [URL_MADEO]: pagina(
    "Filiera Madeo — Soppressata di Calabria",
    "Salumificio Madeo produce salumi in Calabria, tra cui la Soppressata di Calabria DOP."
  ),
  [URL_MASAF]: pagina(
    "MASAF — Soppressata di Calabria DOP",
    "Il Ministero riconosce la denominazione Soppressata di Calabria DOP."
  ),
};

function risultatoDdg(titolo, url, snippet) {
  return `<a class="result__a" href="/l/?uddg=${encodeURIComponent(url)}">${titolo}</a><div class="result__snippet">${snippet}</div>`;
}

test("ricerca keyless sufficiente: Tavily non viene chiamato", async () => {
  let chiamateTavily = 0;
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("html.duckduckgo.com")) {
      const query = new URL(target).searchParams.get("q") ?? "";
      if (query.includes("calabrese")) {
        return new Response("<html><body>nessun risultato</body></html>", { status: 200 });
      }
      const html = query.includes("filiera")
        ? risultatoDdg("MASAF — Soppressata di Calabria DOP", URL_MASAF, "Denominazione di origine protetta.")
        : risultatoDdg("Filiera Madeo", URL_MADEO, "Madeo produce Soppressata di Calabria in Calabria.");
      return new Response(`<html><body>${html}</body></html>`, { status: 200 });
    }
    if (target.includes("www.bing.com/search")) {
      return new Response("<html><body></body></html>", { status: 200 });
    }
    if (target.includes("api.tavily.com")) {
      chiamateTavily += 1;
      return new Response("{}", { status: 500 });
    }
    if (PAGINE[target]) return new Response(PAGINE[target], { status: 200 });
    return new Response("", { status: 404 });
  };

  const esito = await creaRicercaWebIbrida({
    apiKey: "test-key",
    fetchImpl,
    adesso: () => new Date("2026-11-20T10:00:00Z"),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  assert.equal(chiamateTavily, 0);
  assert.match(esito.motore, /^keyless:/);
  assert.ok(esito.fonti.some((fonte) => fonte.dominio === "www.filieramadeo.it"));
  assert.ok(esito.fonti.some((fonte) => fonte.dominio === "www.masaf.gov.it"));
  assert.equal(esito.sintesi.produttore.stato, "dichiarata");
  assert.equal(esito.sintesi.filieraCalabrese.stato, "supportata");
});

test("fonti keyless insufficienti: Tavily fast interviene come secondo livello", async () => {
  const chiamateTavily = [];
  const tavilyResults = [
    {
      title: "Filiera Madeo — Soppressata di Calabria",
      url: URL_MADEO,
      content: "Madeo produce Soppressata di Calabria in Calabria.",
      score: 0.96,
    },
    {
      title: "MASAF — Soppressata di Calabria DOP",
      url: URL_MASAF,
      content: "Denominazione di origine protetta Soppressata di Calabria DOP.",
      score: 0.91,
    },
  ];
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("html.duckduckgo.com")) {
      return new Response("<html><body>nessun risultato</body></html>", { status: 200 });
    }
    if (target.includes("www.bing.com/search")) {
      return new Response("<html><body>nessun risultato</body></html>", { status: 200 });
    }
    if (target.includes("it.wikipedia.org/w/api.php")) {
      return new Response(JSON.stringify({ query: { search: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (target === "https://api.tavily.com/search") {
      const body = JSON.parse(String(init.body ?? "{}"));
      chiamateTavily.push(body);
      return new Response(JSON.stringify({
        results: tavilyResults,
        usage: { credits: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (PAGINE[target]) return new Response(PAGINE[target], { status: 200 });
    return new Response("", { status: 404 });
  };

  const esito = await creaRicercaWebIbrida({
    apiKey: "test-key",
    fetchImpl,
    adesso: () => new Date("2026-11-20T10:00:00Z"),
  }).cerca({
    riconoscimento: riconoscimento({
      prodotto: "Soppressata calabrese",
      denominazioneProposta: null,
      schemaProposto: null,
    }),
  });

  assert.equal(esito.stato, "ok");
  assert.equal(chiamateTavily.length, 4);
  assert.ok(chiamateTavily.every((chiamata) => chiamata.search_depth === "fast"));
  assert.match(esito.motore, /^keyless\+tavily:/);
  assert.ok(esito.fonti.some((fonte) => fonte.dominio === "www.filieramadeo.it"));
  assert.ok(esito.fonti.some((fonte) => fonte.dominio === "www.masaf.gov.it"));
  assert.equal(esito.consumi.creditiTotali, 4);
});
