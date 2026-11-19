import { isUrlProvaUfficiale, type SchemaQualita } from "./fonti";
import type {
  EsitoRicercaDocumentale,
  ProvaDocumentale,
  ProviderRicercaDocumentale,
  RiconoscimentoAi,
  StatoProva,
} from "./tipi";
import {
  denominazioniEquivalenti,
  normalizzaDenominazione,
  variantiParola,
} from "./verifica";

/**
 * RadiciScan — ricerca documentale ufficiale.
 *
 * Fonte primaria: eAmbrosia, il registro unionale delle indicazioni
 * geografiche. La ricerca usa l'API pubblica `namelike` e non un motore di
 * ricerca generalista: i dati restituiti sono quelli del registro, con
 * identificativo, stato, atto giuridico e pubblicazioni ufficiali.
 *
 * Regole:
 * - nessun URL costruito con input non codificato;
 * - host fisso, redirect rifiutati, timeout e tetto della risposta;
 * - una prova è `ufficiale` solo se proviene da eAmbrosia;
 * - un errore di rete non viene mai trasformato in "nessuna prova".
 */

const BASE_URL =
  "https://webgate.ec.europa.eu/eambrosia-api/api/v1/geographical-indications";
const HOST_API = "webgate.ec.europa.eu";
// eAmbrosia può impiegare ~8 s a rispondere anche a una singola ricerca:
// 12 s lasciano margine senza superare il budget di 40 s della route.
const TIMEOUT_PREDEFINITO_MS = 12_000;
const MAX_RISPOSTA_BYTES = 1_500_000;
const MAX_QUERY = 4;
const MAX_PROVE = 6;

interface PubblicazioneEAmbrosia {
  text?: unknown;
  uri?: unknown;
}

interface RigaEAmbrosia {
  giIdentifier?: unknown;
  protectedNames?: unknown;
  fileNumber?: unknown;
  countries?: unknown;
  giType?: unknown;
  status?: unknown;
  euProtectionDate?: unknown;
  legalInstrument?: {
    text?: unknown;
    uri?: unknown;
  } | null;
  publications?: unknown;
  removedFlag?: unknown;
}

export interface OpzioniRicercaEAmbrosia {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  adesso?: () => Date;
}

function nonVuoto(valore: unknown): string | null {
  return typeof valore === "string" && valore.trim() !== ""
    ? valore.trim()
    : null;
}

function elencoTesti(valore: unknown): string[] {
  if (!Array.isArray(valore)) return [];
  return valore
    .map((voce) => nonVuoto(voce))
    .filter((voce): voce is string => voce !== null);
}

function mappaStato(riga: RigaEAmbrosia): StatoProva {
  if (riga.removedFlag === true) return "rimossa";

  const stato = (nonVuoto(riga.status) ?? "").toLowerCase();
  if (stato === "registered") return "registrata";
  if (stato === "published") return "pubblicata";
  if (stato === "applied") return "in_domanda";
  if (
    stato === "rejected" ||
    stato === "cancelled" ||
    stato === "canceled" ||
    stato === "removed"
  ) {
    return "rimossa";
  }
  return "sconosciuto";
}

function mappaSchema(riga: RigaEAmbrosia): SchemaQualita | null {
  const tipo = (nonVuoto(riga.giType) ?? "").toUpperCase();
  if (tipo === "PDO" || tipo === "DOP") return "DOP";
  if (tipo === "PGI" || tipo === "IGP") return "IGP";
  if (tipo === "TSG" || tipo === "STG") return "STG";
  return null;
}

function titoloPubblicazione(valore: unknown): string | null {
  if (!valore || typeof valore !== "object" || Array.isArray(valore)) {
    return null;
  }
  return nonVuoto((valore as PubblicazioneEAmbrosia).text);
}

function urlPubblicazione(valore: unknown): string | null {
  if (!valore || typeof valore !== "object" || Array.isArray(valore)) {
    return null;
  }
  const url = nonVuoto((valore as PubblicazioneEAmbrosia).uri);
  return url && isUrlProvaUfficiale(url) ? url : null;
}

function scegliDocumento(
  legale: { text?: unknown; uri?: unknown } | null | undefined,
  pubblicazioni: unknown
): { riferimento: string | null; riferimentoUrl: string | null; documentoUrl: string | null } {
  const riferimento = nonVuoto(legale?.text);
  const riferimentoUrl = isUrlProvaUfficiale(nonVuoto(legale?.uri))
    ? nonVuoto(legale?.uri)
    : null;

  let documentoUrl = riferimentoUrl;
  if (!documentoUrl && Array.isArray(pubblicazioni)) {
    for (const pubblicazione of pubblicazioni) {
      documentoUrl = urlPubblicazione(pubblicazione);
      if (documentoUrl) break;
    }
  }

  const primoTitolo = Array.isArray(pubblicazioni)
    ? pubblicazioni
        .map((pubblicazione) => titoloPubblicazione(pubblicazione))
        .find((titolo): titolo is string => titolo !== null) ?? null
    : null;

  return {
    riferimento: riferimento ?? primoTitolo,
    riferimentoUrl,
    documentoUrl,
  };
}

/**
 * Varianti realmente interrogabili: denominazione proposta, nome commerciale
 * e una sola variazione morfologica della testa finale (Peperone/Peperoni,
 * Fico/Fichi, Patata/Patate). Le query sono già normalizzate e senza etichette
 * di qualità, così DOP/IGP non restringono inutilmente il registro.
 */
export function variantiRicerca(riconoscimento: RiconoscimentoAi): string[] {
  const basi = [
    riconoscimento.denominazioneProposta,
    riconoscimento.prodotto,
  ];

  const query = new Set<string>();
  for (const base of basi) {
    const pulita = normalizzaDenominazione(base ?? "");
    if (pulita.length < 4) continue;
    query.add(pulita);

    // La parola da variare non è sempre l'ultima: in "Peperone di Senise"
    // è la testa. Si prova una variazione per parola, senza generare
    // combinazioni esplosive.
    const parole = pulita.split(" ");
    for (let indice = 0; indice < parole.length; indice += 1) {
      const parola = parole[indice];
      for (const variante of variantiParola(parola)) {
        if (variante === parola) continue;
        query.add(
          [...parole.slice(0, indice), variante, ...parole.slice(indice + 1)].join(" ")
        );
      }
    }
  }

  return [...query].slice(0, MAX_QUERY);
}

function pertinente(
  nome: string,
  denominazione: string,
  prodotto: string
): boolean {
  if (denominazione && denominazioniEquivalenti(nome, denominazione)) {
    return true;
  }

  const nomeNorm = normalizzaDenominazione(nome);
  if (!nomeNorm) return false;

  for (const atteso of [denominazione, prodotto]) {
    const attesoNorm = normalizzaDenominazione(atteso);
    if (!attesoNorm) continue;

    if (
      nomeNorm === attesoNorm ||
      nomeNorm.includes(attesoNorm) ||
      attesoNorm.includes(nomeNorm)
    ) {
      return true;
    }

    const paroleNome = new Set(nomeNorm.split(" "));
    const paroleAttese = attesoNorm.split(" ").filter(Boolean);
    const comuni = paroleAttese.filter((parola) => paroleNome.has(parola)).length;
    if (paroleAttese.length > 0 && comuni / paroleAttese.length >= 0.6) {
      return true;
    }
  }

  return false;
}

function mappaProva(
  riga: RigaEAmbrosia,
  denominazione: string,
  prodotto: string,
  consultataIl: string
): ProvaDocumentale | null {
  const id = nonVuoto(riga.giIdentifier);
  const nome = elencoTesti(riga.protectedNames)[0] ?? null;
  if (!id || !nome || !/^[A-Za-z0-9]+$/.test(id)) return null;
  if (!pertinente(nome, denominazione, prodotto)) return null;

  const stato = mappaStato(riga);
  const schemaQualita = mappaSchema(riga);
  const tipo = nonVuoto(riga.giType) ?? "IG";
  const fileNumber = nonVuoto(riga.fileNumber);
  const paesi = elencoTesti(riga.countries);
  const protezione = nonVuoto(riga.euProtectionDate);
  const documento = scegliDocumento(riga.legalInstrument, riga.publications);

  const scheda =
    `https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/` +
    encodeURIComponent(id);
  if (!isUrlProvaUfficiale(scheda)) return null;

  const estratto = [
    `Scheda ${id}${fileNumber ? `, file ${fileNumber}` : ""}`,
    `stato: ${stato.replaceAll("_", " ")}`,
    `tipo: ${tipo}`,
    paesi.length > 0 ? `paese: ${paesi.join(", ")}` : null,
    protezione ? `protezione UE dal ${protezione}` : null,
    documento.riferimento ? `atto: ${documento.riferimento}` : null,
  ]
    .filter((voce): voce is string => Boolean(voce))
    .join(" · ");

  const esatta = denominazione
    ? denominazioniEquivalenti(nome, denominazione)
    : false;

  return {
    id: `eambrosia:${id}`,
    tipo: "ufficiale",
    denominazione: nome,
    schemaQualita,
    ente: "Commissione europea — DG Agricoltura e sviluppo rurale (eAmbrosia)",
    titolo: `eAmbrosia — ${nome} (${tipo})`,
    url: scheda,
    riferimentoNormativo: documento.riferimento,
    riferimentoUrl: documento.riferimentoUrl,
    documentoUrl: documento.documentoUrl,
    estratto,
    consultataIl,
    relazione: esatta
      ? `Corrispondenza esatta con la denominazione letta; scheda ufficiale ${id}.`
      : `Denominazione affine restituita dal registro per la ricerca "${denominazione || prodotto}".`,
    stato,
  };
}

function messaggioErroreRete(): string {
  return "La ricerca nel registro eAmbrosia non è stata completata. L'esito non dimostra l'assenza di fonti.";
}

export function ricercaNonEseguita(
  messaggio = "Ricerca documentale non eseguita."
): EsitoRicercaDocumentale {
  return {
    stato: "non_eseguita",
    fonte: null,
    consultataIl: null,
    query: [],
    prove: [],
    messaggio,
  };
}

export function ricercaNonDisponibile(
  messaggio = messaggioErroreRete(),
  consultataIl: string | null = null,
  query: string[] = []
): EsitoRicercaDocumentale {
  return {
    stato: "non_disponibile",
    fonte: "eAmbrosia",
    consultataIl,
    query,
    prove: [],
    messaggio,
  };
}

async function leggiJsonLimitato(risposta: Response): Promise<unknown> {
  const lunghezza = Number(risposta.headers.get("content-length") ?? "");
  if (Number.isFinite(lunghezza) && lunghezza > MAX_RISPOSTA_BYTES) {
    throw new Error("Risposta eAmbrosia troppo grande.");
  }

  const testo = await risposta.text();
  if (testo.length > MAX_RISPOSTA_BYTES) {
    throw new Error("Risposta eAmbrosia troppo grande.");
  }

  try {
    return JSON.parse(testo);
  } catch {
    throw new Error("Risposta eAmbrosia non JSON.");
  }
}

async function cercaQuery(
  query: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch
): Promise<RigaEAmbrosia[]> {
  const url = new URL(BASE_URL);
  if (url.protocol !== "https:" || url.hostname !== HOST_API) {
    throw new Error("Endpoint eAmbrosia non valido.");
  }
  url.search = new URLSearchParams({ namelike: query, lang: "it" }).toString();

  const risposta = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal,
  });

  if (!risposta.ok) {
    throw new Error(`eAmbrosia ha risposto ${risposta.status}.`);
  }

  const payload = await leggiJsonLimitato(risposta);
  if (!Array.isArray(payload)) {
    throw new Error("Formato eAmbrosia inatteso.");
  }

  return payload.filter(
    (riga): riga is RigaEAmbrosia =>
      Boolean(riga) && typeof riga === "object" && !Array.isArray(riga)
  );
}

export function creaRicercaEAmbrosia(
  opzioni: OpzioniRicercaEAmbrosia = {}
): ProviderRicercaDocumentale {
  const fetchImpl = opzioni.fetchImpl ?? fetch;
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_PREDEFINITO_MS;
  const adesso = opzioni.adesso ?? (() => new Date());

  return {
    nome: "eAmbrosia",
    async cerca({ riconoscimento, signal }) {
      const query = variantiRicerca(riconoscimento);
      const consultataIl = adesso().toISOString().slice(0, 10);

      if (query.length === 0) {
        return ricercaNonEseguita(
          "Nessuna denominazione o nome prodotto utilizzabile per la ricerca."
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const annulla = () => controller.abort();
      signal?.addEventListener("abort", annulla, { once: true });
      if (signal?.aborted) controller.abort();

      try {
        const esiti = await Promise.allSettled(
          query.map((voce) => cercaQuery(voce, controller.signal, fetchImpl))
        );

        const righe: RigaEAmbrosia[] = [];
        let errori = 0;
        for (const esito of esiti) {
          if (esito.status === "fulfilled") righe.push(...esito.value);
          else errori += 1;
        }

        if (errori === esiti.length) {
          return ricercaNonDisponibile(
            messaggioErroreRete(),
            consultataIl,
            query
          );
        }

        const visti = new Set<string>();
        const prove: ProvaDocumentale[] = [];
        for (const riga of righe) {
          const prova = mappaProva(
            riga,
            riconoscimento.denominazioneProposta ?? "",
            riconoscimento.prodotto,
            consultataIl
          );
          if (!prova || visti.has(prova.id)) continue;
          visti.add(prova.id);
          prove.push(prova);
        }

        // Le corrispondenze esatte e le denominazioni registrate vengono
        // mostrate prima; il resto resta un riscontro parziale, mai un
        // "verificato" automatico.
        prove.sort((a, b) => {
          const esattaA = a.relazione.startsWith("Corrispondenza esatta") ? 1 : 0;
          const esattaB = b.relazione.startsWith("Corrispondenza esatta") ? 1 : 0;
          if (esattaA !== esattaB) return esattaB - esattaA;
          const registrataA = a.stato === "registrata" ? 1 : 0;
          const registrataB = b.stato === "registrata" ? 1 : 0;
          return registrataB - registrataA;
        });

        if (prove.length === 0 && errori > 0) {
          return ricercaNonDisponibile(
            messaggioErroreRete(),
            consultataIl,
            query
          );
        }

        return {
          stato: "ok",
          fonte: "eAmbrosia",
          consultataIl,
          query,
          prove: prove.slice(0, MAX_PROVE),
          messaggio:
            errori > 0
              ? "Alcune varianti della ricerca non hanno risposto; i documenti mostrati sono quelli recuperati."
              : null,
        };
      } catch {
        return ricercaNonDisponibile(messaggioErroreRete(), consultataIl, query);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", annulla);
      }
    },
  };
}
