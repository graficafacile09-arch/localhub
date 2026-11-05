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
  // Riconosce varianti di markup e pagine che espongono direttamente i link
  // alle schede farmacia. Non accettare una pagina HTML generica solo perché
  // contiene la parola "farmacie": altrimenti il parser può restituire zero
  // e Pino comunica erroneamente che non esistono risultati.
  return (
    /<div\b[^>]*class\s*=\s*["'][^"']*farmacia-box/i.test(html) ||
    /itemtype\s*=\s*["'][^"']*schema\.org\/Pharmacy/i.test(html) ||
    /class\s*=\s*["'][^"']*pharmacyname/i.test(html) ||
    /itemprop\s*=\s*["']name["']/i.test(html) ||
    /href\s*=\s*["'][^"']*[?&]idf=\d+/i.test(html)
  );
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

    const statoRaw = blocco
      .match(/class=["'][^"']*btorario[^"']*["'][^>]*>\s*([^<]+)/i)?.[1]
      ?.trim()
      .toUpperCase();
    const orarioRaw =
      blocco.match(/class=["'][^"']*orario[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
      blocco.match(/(?:Apertura|Turno\*?)\s*:[^<]*(?:<[^>]+>[^<]*)?/i)?.[0] ??
      "";
    const apertura = orarioRaw.match(/Apertura\s*:\s*([^<]+)/i)?.[1]?.trim() ?? null;
    // La fonte usa sia "Turno:" sia "Turno*:" (nota l'asterisco).
    const turno = orarioRaw.match(/Turno\*?\s*:\s*([^<]+)/i)?.[1]?.trim() ?? null;
    const telefono = blocco.match(/href=["']tel:([0-9+ ]+)["']/i)?.[1]?.replace(/\s+/g, "") ?? null;
    const idf = blocco.match(/[?&]idf=(\d+)/i)?.[1] ?? null;

    farmacie.push({
      id: idf ?? null,
      nome: decodifica(nome),
      indirizzo: estraiIndirizzo(blocco),
      stato:
        statoRaw === "CHIUSA" || statoRaw === "CHIUSO"
          ? "chiusa"
          : statoRaw === "TURNO"
            ? "turno"
            : statoRaw === "APERTA" || statoRaw === "APERTO"
              ? "aperta"
              : null,
      apertura: apertura ? decodifica(apertura) : null,
      turno: turno ? decodifica(turno) : null,
      telefono,
      urlScheda: idf
        ? `https://www.farmaciediturno.org/farmacia.asp?idf=${idf}`
        : null,
    });
  }
  if (farmacie.length > 0) return farmacie;

  // Fallback per il layout a link: alcune versioni della pagina pubblicano
  // nome, stato e orari come link con idf, senza i vecchi div schema.org.
  const linkSchede = Array.from(
    html.matchAll(/<a\b[^>]*href\s*=\s*["'][^"']*[?&]idf=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)
  );
  const viste = new Set<string>();
  const estratte: FarmaciaTurno[] = [];
  for (let i = 0; i < linkSchede.length; i++) {
    const match = linkSchede[i];
    const idf = match[1];
    const nome = decodifica(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (
      viste.has(idf) ||
      nome.length < 3 ||
      /^(scheda|orario|servizi|mappa|navigatore|aperta|aperto|chiusa|chiuso|turno|apertura)$/i.test(nome) ||
      /^(apertura|turno)\s*:/i.test(nome)
    ) continue;
    viste.add(idf);
    const prossimo = linkSchede.slice(i + 1).find((voce) => voce[1] !== idf);
    const fine = prossimo?.index ?? html.length;
    const blocco = html.slice(match.index + match[0].length, fine);
    const testo = decodifica(
      blocco.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    );
    const statoMatch = testo.match(/\b(APERTA|APERTO|CHIUSA|CHIUSO|TURNO)\b/i)?.[1]?.toUpperCase();
    const apertura = testo.match(/Apertura\s*:\s*([^|]+?)(?=\s+Turno\*?\s*:|$)/i)?.[1]?.trim() ?? null;
    const turno = testo.match(/Turno\*?\s*:\s*([^|]+?)(?=\s+(?:Telefono|Servizi|Mappa)|$)/i)?.[1]?.trim() ?? null;
    const indirizzo = testo.match(/\b(?:Via|Viale|Corso|Piazza|Contrada|Largo|Strada)\s+[^,]{2,90}(?:,\s*\d+[A-Za-z/]*)?/i)?.[0] ?? null;
    const telefono = blocco.match(/href\s*=\s*["']tel:([0-9+ ]+)["']/i)?.[1]?.replace(/\s+/g, "") ??
      testo.match(/\b0\d{5,11}\b/)?.[0] ?? null;
    estratte.push({
      id: idf,
      nome,
      indirizzo: indirizzo ? decodifica(indirizzo) : null,
      stato:
        statoMatch === "CHIUSA" || statoMatch === "CHIUSO" ? "chiusa" :
        statoMatch === "TURNO" ? "turno" :
        statoMatch === "APERTA" || statoMatch === "APERTO" ? "aperta" : null,
      apertura: apertura ? decodifica(apertura) : null,
      turno: turno ? decodifica(turno) : null,
      telefono,
      urlScheda: `https://www.farmaciediturno.org/farmacia.asp?idf=${idf}`,
    });
  }
  return estratte;
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
      const valide = rispostaFarmacieValida(html);
      const estratte = valide ? parseFarmacieTurno(html) : [];
      console.info("[farmacie-turno] lettura fonte", JSON.stringify({
        httpStatus: res.status,
        htmlLength: html.length,
        strutturaRiconosciuta: valide,
        farmacieEstratte: estratte.length,
      }));
      if (valide && estratte.length > 0) {
        esito = { html, codice: null };
      } else {
        console.error("[farmacie-turno] risposta non riconosciuta o parser senza risultati");
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
