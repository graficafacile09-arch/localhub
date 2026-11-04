/**
 * P1.3.2 — fixture sintetiche per separare tre capacità:
 *   1. ricerca prodotto per marca;
 *   2. ricerca di un negozio;
 *   3. prodotti appartenenti a un negozio tramite `negozio_id`.
 *
 * La marca "Pelletteria Rossi" è presente in due negozi diversi. Il negozio
 * "Emporio del Cuoio" vende anche un prodotto di un'altra marca. In questo modo
 * una ricerca per marca NON coincide con tutti i prodotti del negozio e una
 * ricerca del negozio NON coincide con tutti i prodotti della marca.
 */

export const negoziAmbiguitaP13 = [
  {
    id: "n-emporio",
    nome: "Emporio del Cuoio",
    categoria: "Accessori",
    descrizione: "Borse, cinture e accessori in cuoio.",
    attivo: true,
    servizi: [],
    parole_chiave: ["borse", "cuoio", "accessori"],
    data: { tipo_attivita: "negozio di accessori" },
  },
  {
    id: "n-borgo",
    nome: "Bottega del Borgo",
    categoria: "Accessori",
    descrizione: "Pelletteria e accessori del borgo.",
    attivo: true,
    servizi: [],
    parole_chiave: ["pelletteria", "accessori", "borgo"],
    data: { tipo_attivita: "negozio di accessori" },
  },
];

export const righeCatalogoAmbiguitaP13 = [
  {
    id: "a-borsa",
    slug: "borsa-artigianale",
    negozio_id: "n-emporio",
    negozio_nome: "Emporio del Cuoio",
    nome: "Borsa artigianale",
    descrizione: "Borsa in pelle lavorata a mano.",
    descrizione_completa: "Borsa artigianale in pelle con tracolla.",
    categoria: "Accessori",
    sottocategoria: "Borse",
    marca: "Pelletteria Rossi",
    parole_chiave: ["borsa", "pelle", "artigianale"],
    caratteristiche: ["Fatta a mano"],
    prezzo: 89,
    immagine_principale: null,
  },
  {
    id: "a-cintura",
    slug: "cintura-artigianale",
    negozio_id: "n-emporio",
    negozio_nome: "Emporio del Cuoio",
    nome: "Cintura artigianale",
    descrizione: "Cintura in pelle.",
    descrizione_completa: "Cintura artigianale in pelle.",
    categoria: "Accessori",
    sottocategoria: "Cinture",
    marca: "Pelletteria Rossi",
    parole_chiave: ["cintura", "pelle"],
    caratteristiche: ["Fatta a mano"],
    prezzo: 39,
    immagine_principale: null,
  },
  {
    id: "a-portafoglio",
    slug: "portafoglio-in-pelle",
    negozio_id: "n-emporio",
    negozio_nome: "Emporio del Cuoio",
    nome: "Portafoglio in pelle",
    descrizione: "Portafoglio in pelle.",
    descrizione_completa: "Portafoglio compatto in pelle.",
    categoria: "Accessori",
    sottocategoria: "Portafogli",
    marca: "Cuoio & Co",
    parole_chiave: ["portafoglio", "pelle"],
    caratteristiche: ["Compatto"],
    prezzo: 29,
    immagine_principale: null,
  },
  {
    id: "a-borsa-borgo",
    slug: "borsa-da-viaggio",
    negozio_id: "n-borgo",
    negozio_nome: "Bottega del Borgo",
    nome: "Borsa da viaggio",
    descrizione: "Borsa capiente in pelle.",
    descrizione_completa: "Borsa da viaggio in pelle.",
    categoria: "Accessori",
    sottocategoria: "Borse",
    marca: "Pelletteria Rossi",
    parole_chiave: ["borsa", "viaggio", "pelle"],
    caratteristiche: ["Capiente"],
    prezzo: 119,
    immagine_principale: null,
  },
];
