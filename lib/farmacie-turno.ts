/**
 * Farmacie di turno a Castrovillari — dati pubblici da farmaciediturno.org.
 *
 * SOLO server-side: usato esclusivamente da app/api/farmacie-turno, che
 * alimenta il widget nell'header. Il sito esterno non espone un'API JSON:
 * la pagina "comune.asp?cod=78033" (Orari di oggi per Castrovillari) viene
 * scaricata e parsata.
 *
 * Principio fondamentale: BEST-EFFORT — la pagina esterna non deve MAI
 * rompere il sito. Qualunque errore (rete, timeout, formato HTML cambiato)
 * restituisce una lista vuota senza lanciare eccezioni: il widget sparisce
 * silenziosamente e tutto il resto resta invariato.
 */

/** Pagina "Orari di oggi" di farmaciediturno.org per Castrovillari (cod 78033). */
import { segnalaErroreDati, type SegnalazioneErroriDati } from "./negozi";

const URL_FARMACIE_TURNO = "https://www.farmaciediturno.org/comune.asp?cod=78033";
const TIMEOUT_MS = 8_000;

/**
 * M6-C3 — motivo tecnico per cui la fonte non ha risposto correttamente.
 * Il codice distingue HTTP, timeout, rete e risposta non riconosciuta: senza
 * questa distinzione un guasto diventava "nessuna farmacia di turno".
 */
export class ErroreFonteFarmacie extends Error {
  readonly code: string;

  constructor(code: string) {
    super("La fonte delle farmacie di turno non e' disponibile.");
    this.name = "ErroreFonteFarmacie";
    this.code = code;
  }
}

/**
 * Una risposta e' valida se contiene il markup atteso della pagina oppure, in
 * assenza di farmacie, se e' una pagina completa del sito (testo lungo che
 * parla di farmacie). Una pagina di errore/manutenzione non lo e'.
 */
function rispostaFarmacieValida(html: string): boolean {
  if (!html.trim()) return false;
  if (html.includes('class="farmacia-box"')) return true;
  return html.length >= 200 && /farmaci/i.test(html);
}

export type FarmaciaTurno = {
  /** idf della farmacia sul sito esterno (se presente). */
  id: string | null;
  nome: string;
  /** Indirizzo completo (via, civico, CAP, città, provincia). */
  indirizzo: string | null;
  stato: "aperta" | "chiusa" | "turno" | null;
  /** Orario di apertura di oggi (es. "8:30-13:00 e 16:00-21:00"). */
  apertura: string | null;
  /** Testo del turno (es. "Tutto il giorno fino a domani") — presente solo
   *  sulla farmacia di turno. */
  turno: string | null;
  telefono: string | null;
  /** Link alla scheda della farmacia sul sito esterno. */
  urlScheda: string | null;
};

/** Decodifica le entity HTML più comuni del sito (il resto viene rimosso). */
function decodifica(testo: string): string {
  return testo
    .replace(/&amp;/g, "&")
    .replace(/&agrave;/g, "à")
    .replace(/&egrave;/g, "è")
    .replace(/&igrave;/g, "ì")
    .replace(/&ograve;/g, "ò")
    .replace(/&ugrave;/g, "ù")
    .replace(/&eacute;/g, "é")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Estrae l'indirizzo dal blocco .address e lo normalizza in una stringa
 * leggibile: rimuove i tag, converte i <br> in ", " e compatta gli spazi.
 */
function estraiIndirizzo(blocco: string): string | null {
  // Il blocco .address contiene span annidati (streetAddress, addressLocality,
  // addressRegion): si ferma solo alla chiusura seguita da <br>.
  const raw = blocco.match(/<span class="address">([\s\S]*?)<\/span>\s*<br>/)?.[1] ?? "";
  if (!raw.trim()) return null;
  const pulito = decodifica(
    raw
      .replace(/<br\s*\/?>/gi, ", ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*,\s*/g, ", ")
      .replace(/,\s*\)/g, ")")
      .trim()
  );
  return pulito || null;
}

/**
 * Testo dell'orario di una farmacia. La fonte lo racchiude in un link con
 * class `orario`, ma il markup varia (virgolette singole o doppie, attributi
 * riordinati, link assente in alcune varianti): si legge il link quando c'è,
 * altrimenti l'intero blocco, così apertura e turno non si perdono.
 */
function estraiTestoOrari(blocco: string): string {
  const ancorato = blocco.match(
    /class\s*=\s*["']?[^"'>]*\borario\b[^"'>]*["']?[^>]*>([\s\S]*?)<\/a>/i
  )?.[1];
  return ancorato ?? blocco;
}

/** Estrae un campo ("Apertura:" / "Turno*:") dal testo dell'orario. */
function estraiCampoOrario(testo: string, etichetta: RegExp): string | null {
  const righe = testo.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  const valore = righe.match(etichetta)?.[1];
  if (!valore) return null;
  const pulito = decodifica(valore.replace(/\s+/g, " ").trim())
    // Senza <br> tra i campi, il valore di "Apertura:" contiene anche il turno.
    .replace(/\s*Turno\s*\*?\s*:.*$/i, "")
    .replace(/[\s,;·-]+$/, "")
    .trim();
  return pulito || null;
}

/**
 * Stato dichiarato dalla fonte. Il testo dell'etichetta può mancare o essere
 * riscritto, mentre la classe (`cturno`, `cchiuso`, `caperto`) fa parte del
 * markup: la si usa come prova del turno, non come ipotesi.
 */
function statoDaBlocco(blocco: string): FarmaciaTurno["stato"] {
  const classe = blocco.match(/class\s*=\s*["'][^"']*\bbtorario\b[^"']*["']/i)?.[0] ?? "";
  const etichetta = (
    blocco.match(/class\s*=\s*["'][^"']*\bbtorario\b[^"']*["'][^>]*>\s*([^<]+)</i)?.[1] ?? ""
  )
    .trim()
    .toUpperCase();
  if (/\bcturno\b/i.test(classe) || etichetta === "TURNO") return "turno";
  if (/\bcchius[oa]\b/i.test(classe) || etichetta === "CHIUSA" || etichetta === "CHIUSO") return "chiusa";
  if (/\bcapert[oa]\b/i.test(classe) || etichetta === "APERTA" || etichetta === "APERTO") return "aperta";
  return null;
}

/**
 * Prova del turno: stato dichiarato o testo del turno. La fonte può segnalare
 * la farmacia di turno con la sola etichetta "TURNO", senza la riga
 * "Turno*:": scartarla produceva "nessuna farmacia di turno".
 */
export function inTurnoFarmacia(f: Pick<FarmaciaTurno, "stato" | "turno">): boolean {
  return f.stato === "turno" || Boolean(f.turno);
}

/** Parsa l'HTML della pagina in un elenco strutturato di farmacie. */
export function parseFarmacieTurno(html: string): FarmaciaTurno[] {
  // Il markup della fonte è cambiato più volte: non vincolarsi all'ordine
  // degli attributi, alle virgolette o alla versione http/https di schema.org.
  const blocchi = html.split(
    /<div\b(?=[^>]*(?:itemtype=["'][^"']*schema\.org\/Pharmacy|class=["'][^"']*farmacia-box))[^>]*>/i
  );
  blocchi.shift();

  const farmacie: FarmaciaTurno[] = [];
  for (const blocco of blocchi) {
    const nome = (
      blocco.match(/class=["'][^"']*pharmacyname[^"']*["'][^>]*>\s*([^<]+)/i)?.[1] ??
      blocco.match(/itemprop=["']name["'][^>]*>\s*([^<]+)/i)?.[1]
    )?.trim();
    if (!nome) continue;

    const stato = statoDaBlocco(blocco);
    const orari = estraiTestoOrari(blocco);
    const apertura = estraiCampoOrario(orari, /Apertura\s*:\s*([^\n]+)/i);
    // La fonte usa sia "Turno:" sia "Turno*:" (nota l'asterisco).
    const turno = estraiCampoOrario(orari, /Turno\s*\*?\s*:\s*([^\n]+)/i);
    const telefono = blocco.match(/href=["']tel:([0-9+ ]+)["']/i)?.[1]?.replace(/\s+/g, "") ?? null;
    const idf = blocco.match(/[?&]idf=(\d+)/i)?.[1] ?? null;

    farmacie.push({
      id: idf ?? null,
      nome: decodifica(nome),
      indirizzo: estraiIndirizzo(blocco),
      stato,
      apertura,
      turno,
      telefono,
      urlScheda: idf
        ? `https://www.farmaciediturno.org/farmacia.asp?idf=${idf}`
        : null,
    });
  }
  return farmacie;
}

/**
 * Scarica la pagina di oggi e restituisce le farmacie di Castrovillari.
 * MAI throw: ogni problema viene loggato e restituisce una lista vuota.
 */
export async function getFarmacieTurnoCastrovillari(
  segnalazione?: SegnalazioneErroriDati,
  fetchImpl: typeof fetch = fetch
): Promise<FarmaciaTurno[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let esito: { html: string | null; codice: string | null } = { html: null, codice: "RETE" };
  try {
    const res = await fetchImpl(URL_FARMACIE_TURNO, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[farmacie-turno] farmaciediturno.org ha risposto HTTP " + res.status);
      esito = { html: null, codice: "HTTP_" + res.status };
    } else {
      const html = await res.text();
      if (rispostaFarmacieValida(html)) {
        esito = { html, codice: null };
      } else {
        console.error("[farmacie-turno] risposta non riconosciuta");
        esito = { html: null, codice: "RISPOSTA_NON_VALIDA" };
      }
    }
  } catch (err) {
    const timeout = (err as Error)?.name === "AbortError";
    console.error(
      "[farmacie-turno] errore: " + (timeout ? "timeout" : (err as Error)?.message ?? "sconosciuto")
    );
    esito = { html: null, codice: timeout ? "TIMEOUT" : "RETE" };
  } finally {
    clearTimeout(timer);
  }

  if (esito.codice !== null) {
    // M6-C3: la segnalazione avviene FUORI dal try, cosi' l'eccezione
    // dell'adapter Pino non viene riconvertita in errore di rete.
    segnalaErroreDati(segnalazione, new ErroreFonteFarmacie(esito.codice));
    return [];
  }

  return parseFarmacieTurno(esito.html ?? "");
}
