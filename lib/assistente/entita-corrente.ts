/**
 * Entità corrente: se l'utente sta guardando una scheda prodotto o negozio,
 * Pino riceve i dati principali di quella scheda nel contesto del turno, così
 * può rispondere da Chef e Sommelier senza farsi ripetere che cosa è stato
 * aperto. Lettura leggera: una sola query per slug, nessuna ricerca di catalogo.
 * Filiere e territori non sono gestiti qui (non hanno un lookup per slug leggero).
 */
import { getNegozio, getNegozioBySlug, getProdottoBySlug } from "@/lib/negozi";

const RE_PRODOTTO = /^\/prodotto\/([^/?#]+)$/;
const RE_NEGOZIO = /^\/negozio\/([^/?#]+)$/;

/** Testo pulito e troncato: evita di portare nel prompt campi lunghi o non testuali. */
function testo(valore: unknown, massimo = 300): string {
  if (typeof valore !== "string") return "";
  return valore.replace(/\s+/g, " ").trim().slice(0, massimo);
}

/** Estrae lo slug dalla rotta, se è una scheda prodotto o negozio. */
export function slugEntitaCorrente(
  currentPath: string | null | undefined
): { tipo: "prodotto" | "negozio"; slug: string } | null {
  const percorso = (currentPath ?? "").split("?")[0]?.replace(/\/+$/, "") ?? "";
  const prodotto = RE_PRODOTTO.exec(percorso);
  if (prodotto) return { tipo: "prodotto", slug: decodeURIComponent(prodotto[1]) };
  const negozio = RE_NEGOZIO.exec(percorso);
  if (negozio) return { tipo: "negozio", slug: decodeURIComponent(negozio[1]) };
  return null;
}

/**
 * Blocco `<entita_corrente>` con i dati principali dell'entità mostrata, oppure
 * null se la pagina non è una scheda prodotto/negozio o l'entità non esiste.
 */
export async function costruisciEntitaCorrentePino(
  currentPath: string | null | undefined
): Promise<string | null> {
  const bersaglio = slugEntitaCorrente(currentPath);
  if (!bersaglio) return null;

  try {
    if (bersaglio.tipo === "prodotto") {
      const p = await getProdottoBySlug(bersaglio.slug);
      if (!p) return null;
      const negozio = p.negozio_id ? await getNegozio(String(p.negozio_id)) : null;
      const righe = [
        `Tipo: prodotto`,
        `Nome: ${testo(p.nome, 120)}`,
        `Descrizione: ${testo(p.descrizione_completa ?? p.descrizione)}`,
        `Prezzo: ${typeof p.prezzo === "number" ? `${p.prezzo} €` : ""}`,
        `Territorio: ${testo(p.territorio, 120)}`,
        `Negozio: ${testo(negozio?.nome, 120)}`,
        `Istruzione: il soggetto principale di questo turno è questo prodotto. Rispondi specificamente su di esso (uso o ricetta e abbinamento con un vino calabrese), senza parlare di altri prodotti se non richiesto.`,
      ].filter((r) => !/: $/.test(r));
      return `<entita_corrente>\n${righe.join("\n")}\n</entita_corrente>`;
    }

    const n = await getNegozioBySlug(bersaglio.slug);
    if (!n) return null;
    const righe = [
      `Tipo: negozio`,
      `Nome: ${testo(n.nome, 120)}`,
      `Descrizione: ${testo(n.descrizione, 300)}`,
      `Comune: ${testo(n.citta, 120)}`,
    ].filter((r) => !/: $/.test(r));
    return `<entita_corrente>\n${righe.join("\n")}\n</entita_corrente>`;
  } catch {
    // Il contesto dell'entità è un extra: se il DB non risponde, Pino risponde comunque.
    return null;
  }
}
