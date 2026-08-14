/**
 * CATEGORIE NEGOZIO — elenco ufficiale per l'editor e il wizard di creazione.
 *
 * Elenco ampio e professionale delle principali attività commerciali locali,
 * ordinato alfabeticamente (A → Z, con collazione italiana: ignora maiuscole e
 * accenti). L'ordinamento è centralizzato qui: ogni componente che importa
 * `CATEGORIE_NEGOZIO` riceve già l'elenco ordinato.
 *
 * Il valore è salvato nella colonna `negozi.categoria` (testo libero): una
 * categoria personalizzata scritta a mano dal commerciante viene salvata e
 * mostrata esattamente come una categoria predefinita, senza ulteriori
 * colonne o tabelle.
 */

import { toSlug } from "./slug";

/**
 * Categoria del catalogo con il relativo slug pubblico.
 * Lo slug coincide con la colonna `public.categorie.slug` (vedi migration
 * 20260828_categorie_negozi_estese.sql), così i link `/categorie/<slug>`
 * continuano a risolvere verso le pagine categoria già funzionanti.
 */
export type VoceCategoriaNegozio = {
  nome: string;
  slug: string;
};

/**
 * Override dello slug per i nomi il cui slug in DB NON coincide con
 * `toSlug(nome)`. Serve a mantenere gli slug esistenti (e i link relativi)
 * senza rompere la navigazione pubblica.
 */
const SLUG_CATEGORIA_OVERRIDE: Record<string, string> = {
  // toSlug("B&B") produrrebbe "b-b", ma in DB lo slug canonico è
  // "bed-and-breakfast".
  "B&B": "bed-and-breakfast",
};

/** Slug canonico (DB) di una categoria a partire dal suo nome. */
export function slugCategoria(nome: string): string {
  return SLUG_CATEGORIA_OVERRIDE[nome] ?? toSlug(nome);
}

export const CATEGORIE_NEGOZIO: string[] = [
  "Abbigliamento",
  "Calzature",
  "Accessori",
  "Gioielleria",
  "Oreficeria",
  "Profumeria",
  "Cosmetica",
  "Ottica",
  "Pelletteria",
  "Intimo",
  "Sport",
  "Elettronica",
  "Informatica",
  "Telefonia",
  "Elettrodomestici",
  "Casa",
  "Arredamento",
  "Mobili",
  "Illuminazione",
  "Ferramenta",
  "Edilizia",
  "Fai da te",
  "Auto",
  "Moto",
  "Ricambi auto",
  "Biciclette",
  "Alimentari",
  "Supermercato",
  "Macelleria",
  "Pescheria",
  "Panetteria",
  "Pasticceria",
  "Gelateria",
  "Gastronomia",
  "Enoteca",
  "Bar",
  "Ristorante",
  "Pizzeria",
  "Pub",
  "Agricoltura",
  "Fiori e piante",
  "Animali e pet shop",
  "Farmacia",
  "Parafarmacia",
  "Salute e benessere",
  "Parrucchiere",
  "Barbiere",
  "Estetica",
  "Palestre e fitness",
  "Turismo",
  "Hotel",
  "B&B",
  "Agenzia immobiliare",
  "Agenzia viaggi",
  "Servizi professionali",
  "Studi professionali",
  "Assicurazioni",
  "Banche e servizi finanziari",
  "Artigianato",
  "Fotografia",
  "Grafica e comunicazione",
  "Stampa",
  "Regali",
  "Giocattoli",
  "Libreria",
  "Cartoleria",
  "Musica e strumenti musicali",
  "Cultura e intrattenimento",
  "Servizi alla persona",
  "Servizi per aziende",
  "Altro",
].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

/**
 * Le 71 categorie dell'editor come coppie { nome, slug }, già ordinate
 * alfabeticamente (stesso ordinamento di `CATEGORIE_NEGOZIO`). È la FONTE
 * UNICA per la navigazione pubblica (homepage e pagina /categorie): ogni
 * componente/helper che deve elencare le categorie pubbliche importa questo
 * array invece di mantenere un secondo elenco hardcoded.
 */
export const CATEGORIE_NEGOZIO_META: VoceCategoriaNegozio[] = CATEGORIE_NEGOZIO.map((nome) => ({
  nome,
  slug: slugCategoria(nome),
}));

/** Etichetta dell'opzione per inserire una categoria personalizzata. */
export const CATEGORIA_PERSONALIZZATA_LABEL = "+ Inserisci categoria personalizzata";

/**
 * Restituisce true se il valore della categoria non corrisponde a nessuna
 * voce dell'elenco ufficiale (ovvero è una categoria personalizzata).
 */
export function isCategoriaPersonalizzata(categoria: string | null | undefined): boolean {
  const value = (categoria ?? "").trim();
  if (!value) return false;
  return !CATEGORIE_NEGOZIO.some((c) => c.toLowerCase() === value.toLowerCase());
}
