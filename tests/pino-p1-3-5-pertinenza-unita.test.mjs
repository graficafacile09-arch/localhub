import assert from "node:assert/strict";
import test from "node:test";

import { mappaProdottoRiga } from "../lib/negozi.ts";
import {
  filtraProdottiAlimentariPino,
  filtraDessertRichiestoPino,
  filtraProdottiPerSoggettoUnico,
} from "../lib/assistente/tools.ts";
import {
  prodottiSnapshot,
  SHA256_SNAPSHOT,
} from "../scripts/pino-p1-3-4-benchmark.mjs";

function prodotto(overrides) {
  const negozioNome = overrides.negozio_nome ?? "Negozio test";
  return mappaProdottoRiga(
    {
      id: overrides.id,
      slug: overrides.slug ?? overrides.id,
      negozio_id: overrides.negozio_id ?? "n-test",
      nome: overrides.nome,
      descrizione: overrides.descrizione ?? null,
      descrizione_completa: overrides.descrizione_completa ?? null,
      categoria: overrides.categoria ?? "Alimentari",
      sottocategoria: overrides.sottocategoria ?? null,
      marca: overrides.marca ?? null,
      colore: null,
      materiale: null,
      parole_chiave: overrides.parole_chiave ?? [],
      caratteristiche: overrides.caratteristiche ?? [],
      seo_title: overrides.seo_title ?? null,
      seo_description: overrides.seo_description ?? null,
      alt_text_immagine: overrides.alt_text_immagine ?? null,
      prezzo: overrides.prezzo ?? 1,
      immagine_principale: null,
    },
    negozioNome
  );
}

function ids(prodotti) {
  return prodotti.map((p) => String(p.id));
}

function esito(prodotti, query, soggetto) {
  return ids(filtraProdottiAlimentariPino(prodotti, query, soggetto));
}

test("P1.3.5 — snapshot P1.3.3 e regressioni olio da un litro", () => {
  assert.equal(SHA256_SNAPSHOT, "4a9286a6c743098b57e8fb9500acedf178b2b5d3687521601a18eacd42e87175");
  assert.equal(prodottiSnapshot.length, 37);

  for (const query of [
    "Cerco olio in bottiglia da 1 litro",
    "Cerco olio in bottiglia da 1 l",
    "Cerco olio in bottiglia da 100 cl",
    "Cerco olio in bottiglia da 1000 ml",
    "Cerco olio in bottiglia da 1 litri",
    "Cerco olio in bottiglia da un litro",
  ]) {
    assert.deepEqual(esito(prodottiSnapshot, query, "olio"), ["1507"], query);
  }

  assert.deepEqual(
    esito(prodottiSnapshot, "Cerco olio in bottiglia da 2 litri", "olio"),
    []
  );
  assert.deepEqual(
    esito(prodottiSnapshot, "Cerco olio in bottiglia da 1/2 litro", "olio"),
    []
  );
});

test("P1.3.5 — equivalenze di volume, peso e lunghezza", () => {
  const olio500 = prodotto({
    id: "olio-500",
    nome: "Olio 500 ml",
    descrizione: "Bottiglia da 500 ml.",
  });
  const olio1500 = prodotto({
    id: "olio-1500",
    nome: "Olio 1500 ml",
    descrizione: "Bottiglia da 1,5 litri.",
  });
  const miele500 = prodotto({
    id: "miele-500",
    nome: "Miele 500 g",
    descrizione: "Vasetto da mezzo chilo.",
  });
  const miele1000 = prodotto({
    id: "miele-1000",
    nome: "Miele 1 kg",
    descrizione: "Confezione da 1000 g.",
  });
  const nastro = prodotto({
    id: "nastro-1m",
    nome: "Nastro 1 m",
    descrizione: "Rotolo da 100 cm.",
  });

  for (const query of [
    "Cerco olio da 0,5 litri",
    "Cerco olio da 0.5 litri",
    "Cerco olio da 500 ml",
    "Cerco olio da 50 cl",
    "Cerco olio da mezzo litro",
  ]) {
    assert.deepEqual(esito([olio500], query, "olio"), ["olio-500"], query);
  }
  assert.deepEqual(esito([olio500], "Cerco olio da 1 litro", "olio"), []);
  assert.deepEqual(esito([olio1500], "Cerco olio da 1,5 litri", "olio"), ["olio-1500"]);
  assert.deepEqual(
    esito([olio1500], "Cerco olio da un litro e mezzo", "olio"),
    ["olio-1500"]
  );

  for (const query of [
    "Cerco miele da 0,5 kg",
    "Cerco miele da 500 g",
    "Cerco miele da mezzo chilo",
  ]) {
    assert.deepEqual(esito([miele500], query, "miele"), ["miele-500"], query);
  }
  assert.deepEqual(esito([miele1000], "Cerco miele da 1 kg", "miele"), ["miele-1000"]);
  assert.deepEqual(esito([miele1000], "Cerco miele da 1000 g", "miele"), ["miele-1000"]);
  assert.deepEqual(esito([miele1000], "Cerco miele da un chilo", "miele"), ["miele-1000"]);
  assert.deepEqual(esito([miele500], "Cerco miele da 1 kg", "miele"), []);

  assert.deepEqual(esito([nastro], "Cerco nastro da 1 m", "nastro"), ["nastro-1m"]);
  assert.deepEqual(esito([nastro], "Cerco nastro da 100 cm", "nastro"), ["nastro-1m"]);
  assert.deepEqual(esito([nastro], "Cerco nastro da 1000 mm", "nastro"), ["nastro-1m"]);
  assert.deepEqual(esito([nastro], "Cerco nastro da 1 litro", "nastro"), []);

  // Unità incompatibili: un formato di volume non soddisfa un peso.
  assert.deepEqual(esito([olio500], "Cerco olio da 1 kg", "olio"), []);
  assert.deepEqual(esito([miele500], "Cerco miele da 1 litro", "miele"), []);
});

test("P1.3.5 — quantità non documentata e prodotto senza formato", () => {
  const senzaFormato = prodotto({
    id: "olio-senza-formato",
    nome: "Olio senza formato",
    descrizione: "Olio extravergine in bottiglia.",
  });
  const soloNegozio = prodotto({
    id: "olio-solo-negozio",
    nome: "Olio senza formato due",
    descrizione: "Olio extravergine in bottiglia.",
    negozio_nome: "1 litro",
  });
  assert.deepEqual(
    esito([senzaFormato], "Cerco olio in bottiglia da 1 litro", "olio"),
    []
  );
  assert.deepEqual(
    esito([soloNegozio], "Cerco olio in bottiglia da 1 litro", "olio"),
    []
  );
});

test("P1.3.5 — sottocategoria documentata in ogni campo, non nel negozio", () => {
  const subcat = prodotto({
    id: "pasta-subcat",
    nome: "Pasta subcat",
    sottocategoria: "Pasta tipica",
  });
  const descrizione = prodotto({
    id: "pasta-descrizione",
    nome: "Pasta descrizione",
    descrizione: "Pasta tipica calabrese.",
  });
  const descrizioneCompleta = prodotto({
    id: "pasta-descrizione-completa",
    nome: "Pasta descrizione completa",
    descrizione_completa: "Pasta tipica lavorata secondo tradizione.",
  });
  const seo = prodotto({
    id: "pasta-seo-title",
    nome: "Pasta seo title",
    seo_title: "Pasta tipica calabrese",
  });
  const seoDescription = prodotto({
    id: "pasta-seo-description",
    nome: "Pasta seo description",
    seo_description: "Pasta tipica in formato tradizionale.",
  });
  const alt = prodotto({
    id: "pasta-alt",
    nome: "Pasta alt",
    alt_text_immagine: "Pasta tipica calabrese",
  });
  const assente = prodotto({
    id: "pasta-assente",
    nome: "Pasta comune",
    descrizione: "Pasta di semola.",
  });
  const soloNegozio = prodotto({
    id: "pasta-solo-negozio",
    nome: "Pasta comune due",
    descrizione: "Pasta di semola.",
    negozio_nome: "Pasta tipica",
  });
  const catalogo = [
    subcat,
    descrizione,
    descrizioneCompleta,
    seo,
    seoDescription,
    alt,
    assente,
    soloNegozio,
  ];

  assert.deepEqual(
    esito(catalogo, "Cerco pasta tipica", "pasta"),
    [
      "pasta-subcat",
      "pasta-descrizione",
      "pasta-descrizione-completa",
      "pasta-seo-title",
      "pasta-seo-description",
      "pasta-alt",
    ]
  );
  assert.deepEqual(
    esito([assente, soloNegozio], "Cerco pasta tipica", "pasta"),
    []
  );

  // La ricerca generica non deve essere trasformata in una qualificazione.
  assert.deepEqual(
    esito(catalogo, "Cerco pasta", "pasta"),
    [
      "pasta-subcat",
      "pasta-descrizione",
      "pasta-descrizione-completa",
      "pasta-seo-title",
      "pasta-seo-description",
      "pasta-alt",
      "pasta-assente",
      "pasta-solo-negozio",
    ]
  );
});

test("P1.3.5 — caratteristica scoperta in tutti i metadati, non nel negozio", () => {
  const campi = [
    ["caratteristiche", "caratteristiche"],
    ["descrizione", "descrizione"],
    ["descrizione_completa", "descrizione_completa"],
    ["seo_title", "seo_title"],
    ["seo_description", "seo_description"],
    ["alt_text_immagine", "alt_text_immagine"],
  ];
  const catalogo = campi.map(([id, campo]) =>
    prodotto({
      id: `pasta-${id}`,
      nome: `Pasta ${id}`,
      [campo]:
        campo === "caratteristiche"
          ? ["Lavorata a mano"]
          : "Pasta lavorata a mano.",
    })
  );
  const assente = prodotto({
    id: "pasta-assente-caratteristica",
    nome: "Pasta comune",
    descrizione: "Pasta di semola.",
  });
  const soloNegozio = prodotto({
    id: "pasta-solo-negozio-caratteristica",
    nome: "Pasta comune due",
    descrizione: "Pasta di semola.",
    negozio_nome: "Lavorata a mano",
  });
  const nullo = prodotto({
    id: "pasta-nulla",
    nome: "Pasta senza metadati",
    descrizione: null,
    descrizione_completa: null,
    seo_title: null,
    seo_description: null,
    alt_text_immagine: null,
  });

  assert.deepEqual(
    esito([...catalogo, assente, soloNegozio, nullo], "Cerco pasta lavorata a mano", "pasta"),
    campi.map(([id]) => `pasta-${id}`)
  );
  assert.deepEqual(
    esito([assente, soloNegozio, nullo], "Cerco pasta lavorata a mano", "pasta"),
    []
  );
});

test("P1.3.5 — caratteristiche scoperte da tutti i metadati, anche non alimentari", () => {
  const campi = [
    ["nome", { nome: "Borsa fatta a mano" }],
    ["categoria", { categoria: "Accessori fatta a mano" }],
    ["sottocategoria", { sottocategoria: "Borsa fatta a mano" }],
    ["marca", { marca: "Fatta a mano" }],
    ["parole_chiave", { parole_chiave: ["Fatta a mano"] }],
    ["caratteristiche", { caratteristiche: ["Fatta a mano"] }],
    ["descrizione", { descrizione: "Borsa fatta a mano." }],
    ["descrizione_completa", { descrizione_completa: "Borsa fatta a mano." }],
    ["seo_title", { seo_title: "Borsa fatta a mano" }],
    ["seo_description", { seo_description: "Borsa fatta a mano." }],
    ["alt_text_immagine", { alt_text_immagine: "Borsa fatta a mano" }],
  ];

  for (const [campo, overrides] of campi) {
    const conCaratteristica = prodotto({
      id: `nonfood-${campo}`,
      nome: "Borsa artigianale",
      categoria: "Accessori",
      ...overrides,
    });
    const senzaCaratteristica = prodotto({
      id: `nonfood-${campo}-senza`,
      nome: "Borsa comune",
      categoria: "Accessori",
      descrizione: "Borsa in pelle.",
    });

    assert.deepEqual(
      ids(
        filtraProdottiPerSoggettoUnico(
          [conCaratteristica, senzaCaratteristica],
          "borsa",
          "Cerco una borsa fatta a mano"
        )
      ),
      [`nonfood-${campo}`],
      campo
    );
  }
});

test("P1.3.5 — caratteristiche solo in descrizione, descrizione completa, SEO e alt", () => {
  const campi = [
    ["descrizione", { descrizione: "Pasta lavorata a mano." }],
    ["descrizione_completa", { descrizione_completa: "Pasta lavorata a mano." }],
    ["seo_title", { seo_title: "Pasta lavorata a mano" }],
    ["seo_description", { seo_description: "Pasta lavorata a mano." }],
    ["alt_text_immagine", { alt_text_immagine: "Pasta lavorata a mano" }],
  ];

  for (const [campo, overrides] of campi) {
    const conCaratteristica = prodotto({
      id: `pasta-${campo}`,
      nome: "Pasta artigianale",
      ...overrides,
    });
    const senzaCaratteristica = prodotto({
      id: `pasta-${campo}-senza`,
      nome: "Pasta comune",
      descrizione: "Pasta di semola.",
    });

    assert.deepEqual(
      esito([conCaratteristica, senzaCaratteristica], "Cerco pasta lavorata a mano", "pasta"),
      [`pasta-${campo}`],
      campo
    );
  }
});

test("P1.3.5 — quantità esplicita e caratteristica solo in descrizione", () => {
  const conCaratteristica = prodotto({
    id: "pasta-mano-kg",
    nome: "Pasta artigianale",
    descrizione: "Pasta lavorata a mano. Confezione da 1 kg.",
  });
  const senzaCaratteristica = prodotto({
    id: "pasta-senza-mano-kg",
    nome: "Pasta comune",
    descrizione: "Pasta di semola. Confezione da 1 kg.",
  });

  assert.deepEqual(
    esito(
      [conCaratteristica, senzaCaratteristica],
      "Cerco pasta lavorata a mano da 1 kg",
      "pasta"
    ),
    ["pasta-mano-kg"]
  );
});

test("P1.3.5 — collisione nome negozio/prodotto e solo nome negozio", () => {
  const collisione = prodotto({
    id: "pasta-negozio-pasta",
    nome: "Pasta tipica",
    descrizione: "Pasta di semola.",
    negozio_nome: "Pasta",
  });
  const soloNegozio = prodotto({
    id: "pasta-solo-negozio-finale",
    nome: "Pasta comune due",
    descrizione: "Pasta di semola.",
    negozio_nome: "Pasta tipica",
  });

  assert.deepEqual(
    esito([collisione], "Cerco pasta tipica", "pasta"),
    ["pasta-negozio-pasta"]
  );
  assert.deepEqual(
    esito([soloNegozio], "Cerco pasta tipica", "pasta"),
    []
  );
});

test("P1.3.5 — metadati nulli non provocano errori", () => {
  const nullo = prodotto({
    id: "pasta-nulla",
    nome: "Pasta senza metadati",
    descrizione: null,
    descrizione_completa: null,
    seo_title: null,
    seo_description: null,
    alt_text_immagine: null,
  });
  assert.doesNotThrow(() => esito([nullo], "Cerco pasta tipica", "pasta"));
  assert.deepEqual(esito([nullo], "Cerco pasta tipica", "pasta"), []);
});


test("P1.3.5 — 'un dolce' restituisce dessert veri, non alimenti dal gusto dolce", () => {
  const catalogo = [
    prodotto({
      id: "peperone-dolce",
      nome: "Peperone secco dolce 100 g",
      descrizione: "Peperone dolce essiccato.",
    }),
    prodotto({
      id: "cipolla-dolce",
      nome: "Cipolla Bianca di Castrovillari",
      descrizione: "Prodotto agricolo. Dolce e delicata.",
    }),
    prodotto({
      id: "miele-dolce",
      nome: "Miele Millefiori del Pollino",
      descrizione: "Miele dolce e aromatico.",
    }),
    prodotto({
      id: "confettura-cipolla",
      nome: "Dolcezza di Cipolla Bianca",
      descrizione: "Confettura dolce di cipolla, da abbinare a formaggi e carni.",
    }),
    prodotto({
      id: "liquirizia",
      nome: "Liquirizia di Calabria DOP",
      categoria: "Dolciumi",
      sottocategoria: "Specialità dolciarie",
    }),
    prodotto({
      id: "piparelle",
      nome: "Piparelle calabresi",
      categoria: "Dolciumi",
      sottocategoria: "Biscotti tipici",
    }),
    prodotto({
      id: "torrone",
      nome: "Torrone mielato di Bagnara Calabra",
      categoria: "Dolciumi",
      sottocategoria: "Dolci tipici calabresi",
    }),
    prodotto({
      id: "biscotti",
      nome: "Biscotti tradizionali calabresi",
      categoria: "Prodotti da forno",
      sottocategoria: "Biscotti",
    }),
    prodotto({
      id: "ciotaredda",
      nome: "Ciotaredda di Castrovillari",
      descrizione: "Dolcetto tradizionale di Castrovillari, simile ai mostaccioli.",
    }),
  ];
  const attesi = ["liquirizia", "piparelle", "torrone", "biscotti", "ciotaredda"];
  const ids = (query) =>
    filtraProdottiAlimentariPino(catalogo, query, "dolce").map((p) => p.id);

  assert.deepEqual(ids("Voglio un dolce"), attesi);
  assert.deepEqual(ids("Cerco dei dolci"), attesi);
  assert.deepEqual(ids("Vorrei qualcosa di dolce"), attesi);
});

test("P1.3.5 — 'vino dolce' resta una ricerca di vino e peperoni resta una ricerca di peperoni", () => {
  const vino = prodotto({
    id: "vino-dolce",
    nome: "Vino passito dolce",
    categoria: "Alimentari",
    descrizione: "Vino passito dal gusto dolce.",
  });
  const peperone = prodotto({
    id: "peperone-dolce",
    nome: "Peperone secco dolce 100 g",
    descrizione: "Peperone dolce essiccato.",
  });

  assert.deepEqual(
    filtraProdottiAlimentariPino([vino], "Cerco vino dolce", "dolce").map((p) => p.id),
    ["vino-dolce"]
  );
  assert.deepEqual(
    filtraProdottiAlimentariPino([peperone], "Cerco peperoni", "peperone").map((p) => p.id),
    ["peperone-dolce"]
  );
});


test("P1.3.5 — la barriera finale impedisce al recupero semantico di reinserire falsi dessert", () => {
  const peperone = prodotto({
    id: "peperone-dolce",
    nome: "Peperone secco dolce 100 g",
    descrizione: "Peperone dolce essiccato.",
  });
  const miele = prodotto({
    id: "miele",
    nome: "Miele Millefiori",
    descrizione: "Miele dal gusto dolce.",
  });
  const torrone = prodotto({
    id: "torrone",
    nome: "Torrone mielato",
    categoria: "Dolciumi",
  });
  const piparelle = prodotto({
    id: "piparelle",
    nome: "Piparelle calabresi",
    categoria: "Dolciumi",
  });

  // Simula il merge di risultati arrivati da un recupero secondario:
  // la barriera deve agire anche se il candidato non è passato dal primo gate.
  assert.deepEqual(
    ids(filtraDessertRichiestoPino([peperone, miele, torrone, piparelle], "Voglio un dolce")),
    ["torrone", "piparelle"]
  );
  assert.deepEqual(
    ids(filtraDessertRichiestoPino([peperone, miele], "Cerco vino dolce")),
    ["peperone-dolce", "miele"]
  );
  assert.deepEqual(
    ids(filtraDessertRichiestoPino([peperone, miele], "Cerco peperoni")),
    ["peperone-dolce", "miele"]
  );
});
