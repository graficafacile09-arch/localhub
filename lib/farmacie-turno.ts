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
const URL_FARMACIE_TURNO = "https://www.farmaciediturno.org/comune.asp?cod=78033";
const TIMEOUT_MS = 8_000;

export type FarmaciaTurno = {
  /** idf della farmacia sul sito esterno (se presente). */
  id: string | null;
  nome: string;
  /** Indirizzo completo (via, civico, CAP, città, provincia). */
  indirizzo: string | null;
  stato: "aperta" | "chiusa";
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
  const blocchi = html.split(
    '<div itemscope itemtype="https://schema.org/Pharmacy" class="farmacia-box">'
  );
  blocchi.shift();

  const farmacie: FarmaciaTurno[] = [];
  for (const blocco of blocchi) {
    const nome = blocco.match(/class="pharmacyname">([^<]+)</)?.[1]?.trim();
    if (!nome) continue;

    const statoRaw = blocco
      .match(/class="btorario[^"]*"[^>]*>\s*([^<]+)</)?.[1]
      ?.trim()
      .toUpperCase();
    const orarioRaw = blocco.match(/class='orario'>([\s\S]*?)<\/a>/)?.[1] ?? "";
    const apertura = orarioRaw.match(/Apertura:\s*([^<]+)/)?.[1]?.trim() ?? null;
    const turno = orarioRaw.match(/Turno:\s*([^<]+)/)?.[1]?.trim() ?? null;
    const telefono = blocco.match(/href="tel:([0-9+]+)"/)?.[1] ?? null;
    const idf = blocco.match(/idf=(\d+)/)?.[1] ?? null;

    farmacie.push({
      id: idf ?? null,
      nome: decodifica(nome),
      indirizzo: estraiIndirizzo(blocco),
      stato: statoRaw === "CHIUSA" ? "chiusa" : "aperta",
      apertura: apertura ? decodifica(apertura) : null,
      turno: turno ? decodifica(turno) : null,
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
export async function getFarmacieTurnoCastrovillari(): Promise<FarmaciaTurno[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let html = "";
    try {
      const res = await fetch(URL_FARMACIE_TURNO, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`[farmacie-turno] farmaciediturno.org ha risposto HTTP ${res.status}`);
        return [];
      }
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }
    return parseFarmacieTurno(html);
  } catch (err) {
    console.error(
      `[farmacie-turno] errore: ${(err as Error)?.name === "AbortError" ? "timeout" : (err as Error)?.message ?? "sconosciuto"}`
    );
    return [];
  }
}
