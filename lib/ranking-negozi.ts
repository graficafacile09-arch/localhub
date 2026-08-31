import { normalizza, radice, estraiTermini, estraiToken } from "./text-utils";

type NegozioIndicizzabile = {
  id: string;
  nome?: string | null;
  categoria?: string | null;
  sottocategoria?: string | null;
  descrizione?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  sito_web?: string | null;
  servizi?: string[] | string | null;
  parole_chiave?: string[] | string | null;
  /** tipo_attivita (profilo) — può arrivare da negozi.data.tipo_attivita o dalla RPC */
  tipo_attivita?: string | null;
  /** colonna jsonb `data` (per leggere tipo_attivita e servizi_strutturati) */
  data?: Record<string, unknown> | null;
};

// I servizi strutturati sono dentro negozi.data.servizi_strutturati (jsonb).
function serviziStrutturatiComeTesto(data: NegozioIndicizzabile["data"]): string {
  const lista = data?.servizi_strutturati;
  if (!Array.isArray(lista)) return "";
  return lista
    .filter((s) => s && typeof s === "object" && (s as { attivo?: boolean }).attivo !== false)
    .map((s) => String((s as { nome?: unknown }).nome ?? ""))
    .join(" ");
}



function contieneTermineRilevante(campo: string | null | undefined, termine: string) {
  const tokens = estraiToken(campo);
  const termineNorm = normalizza(termine);
  const radiceTermine = radice(termineNorm);

  return tokens.some((token) => {
    if (token === termineNorm) {
      return true;
    }

    if (token.length < 3 || termineNorm.length < 3) {
      return false;
    }

    const radiceToken = radice(token);

    return (
      radiceToken === radiceTermine ||
      (token.length >= 4 && termineNorm.length >= 4 && token.startsWith(termineNorm)) ||
      (token.length >= 4 && termineNorm.length >= 4 && termineNorm.startsWith(token))
    );
  });
}

function paroleChiaveComeTesto(paroleChiave: NegozioIndicizzabile["parole_chiave"]) {
  if (Array.isArray(paroleChiave)) {
    return paroleChiave.join(" ");
  }

  return paroleChiave ?? "";
}

// servizi è text[] nel DB: lo converto in testo per il matching in memoria
// (stesso trattamento già riservato a parole_chiave).
function serviziComeTesto(servizi: NegozioIndicizzabile["servizi"]) {
  if (Array.isArray(servizi)) {
    return servizi.join(" ");
  }

  return servizi ?? "";
}

// ─── Pesi per campo quando il termine è ORIGINALE (digitato dall'utente) ─────
// i campi "identità" (nome, tipo_attivita, categoria, sottocategoria) pesano
// molto più dei campi descrittivi (descrizione, sito). Un match di un termine
// ESPANSO (sinonimo) vale una frazione del match di un termine originale: così
// una farmacia che matcha "farmacia" (originale) batte sempre un generico
// "Salute e benessere" che matcha solo sinonimi espansi.
const PESO_ORIGINALE = {
  nome: 20,
  tipo: 20,
  categoria: 16,
  sottocategoria: 14,
  serviziStrutturati: 16,
  paroleChiave: 12,
  servizi: 10,
  citta: 12,
  descrizione: 6,
  indirizzo: 3,
  sito: 1,
};

// I risultati arrivano con i termini ESPANSI (es. "farmacia" → [farmacia, salute,
// medicinali, ...]). Un match su un termine originale vale 1x; su un sinonimo
// espanso vale FATTORE_ESPANSO (più debole). Così i termini digitati dall'utente
// dominano il ranking e i sinonimi generici non fanno emergere attività estranee.
const FATTORE_ESPANSO = 0.5;

function estraiCampi(negozio: NegozioIndicizzabile) {
  return {
    nome: negozio.nome ?? "",
    categoria: negozio.categoria ?? "",
    sottocategoria: negozio.sottocategoria ?? "",
    descrizione: negozio.descrizione ?? "",
    indirizzo: negozio.indirizzo ?? "",
    citta: negozio.citta ?? "",
    sito: negozio.sito_web ?? "",
    servizi: serviziComeTesto(negozio.servizi),
    paroleChiave: paroleChiaveComeTesto(negozio.parole_chiave),
    tipoAttivita: negozio.tipo_attivita ?? String((negozio.data as { tipo_attivita?: unknown } | null | undefined)?.tipo_attivita ?? ""),
    serviziStrutturati: serviziStrutturatiComeTesto(negozio.data),
  };
}

/**
 * Calcola il punteggio di pertinenza di un negozio.
 *
 * Il primo parametro `terminiOriginali` sono i token DIGITATI dall'utente;
 * `terminiEspansi` sono i token ottenuti dalla espansione semantica (sinonimi +
 * profilo attività). Un termine che compare in entrambi è "originale" e pesa 1x;
 * un termine presente SOLO nell'espansione è un sinonimo e pesa FATTORE_ESPANSO.
 *
 * Questo separa nettamente un match specifico (es. "farmacia" in un negozio di
 * farmacia) da un match generico di profilo (es. "salute"/"benessere" in un
 * qualsiasi negozio "Salute e benessere"): il primo domina il ranking, il
 * secondo è solo un segnale debole.
 */
export function calcolaPunteggioNegozioConEspansione(
  negozio: NegozioIndicizzabile,
  terminiOriginali: string[],
  terminiEspansi: string[]
) {
  const originali = new Set(terminiOriginali.map((t) => normalizza(t).trim()).filter(Boolean));
  const campi = estraiCampi(negozio);

  // Separa il contributo dei termini ORIGINALI da quello dei sinonimi espansi:
  // i sinonimi in un campo (es. "dottore"/"medico"/"quotidiano") NON possono
  // accumularsi oltre un tetto, altrimenti un negozio con una ricca descrizione
  // sanitaria (es. Dott. Bianchi) vincerebbe per "dentista"/"farmacia" su una
  // vera attività del tipo cercato. Il tetto fa sì che un match sul termine
  // ORIGINALE nel nome/categoria/tipo batta sempre l'accumulo di sinonimi.
  let punteggioOriginale = 0;
  let punteggioEspanso = 0;
  // Termini ORIGINALI (digitati) che matchano almeno un campo: conta QUANTI
  // criteri distinti della richiesta sono soddisfatti (es. "pesce" E
  // "Castrovillari", "tipico" E "calabrese"). Usato per il bonus di coerenza.
  const criteriOriginaliSoddisfatti =
    new Set<string>();
  const assume = (campo: string, peso: number, termine: string) => {
    if (!campo) return;
    if (contieneTermineRilevante(campo, termine)) {
      const t = normalizza(termine).trim();
      if (originali.has(t)) {
        punteggioOriginale += peso;
        criteriOriginaliSoddisfatti.add(t);
      } else {
        punteggioEspanso += peso * FATTORE_ESPANSO;
      }
    }
  };

  for (const termine of terminiEspansi) {
    const t = normalizza(termine).trim();
    if (!t) continue;
    assume(campi.nome, PESO_ORIGINALE.nome, t);
    assume(campi.tipoAttivita, PESO_ORIGINALE.tipo, t);
    assume(campi.categoria, PESO_ORIGINALE.categoria, t);
    assume(campi.sottocategoria, PESO_ORIGINALE.sottocategoria, t);
    assume(campi.serviziStrutturati, PESO_ORIGINALE.serviziStrutturati, t);
    assume(campi.paroleChiave, PESO_ORIGINALE.paroleChiave, t);
    assume(campi.servizi, PESO_ORIGINALE.servizi, t);
    assume(campi.descrizione, PESO_ORIGINALE.descrizione, t);
    assume(campi.indirizzo, PESO_ORIGINALE.indirizzo, t);
    assume(campi.citta, PESO_ORIGINALE.citta, t);
    assume(campi.sito, PESO_ORIGINALE.sito, t);
  }

  // Tetto ai sinonimi espansi: contributo massimo ai match di sola espansione.
  const TETTO_ESPANSO = 18;

  // Bonus di COERENZA multi-criterio: se il negozio soddisfa PIÙ termini
  // originali distinti della richiesta (es. "pesce" + "castrovillari"), sale
  // sopra un risultato che ne soddisfa uno solo. Additivo e conservativo:
  // il bonus è zero con un solo criterio, quindi le query semplici non cambiano.
  const criteri = criteriOriginaliSoddisfatti.size;
  const bonusCoerenza = criteri > 1 ? 3 * (criteri - 1) : 0;
  return punteggioOriginale + Math.min(punteggioEspanso, TETTO_ESPANSO) + bonusCoerenza;
}

/** Compat: dato solo il testo espanso, ogni termine è "originale" (1x). */
export function calcolaPunteggioNegozio(
  negozio: NegozioIndicizzabile,
  query: string
) {
  const term = estraiTermini(query);
  return calcolaPunteggioNegozioConEspansione(negozio, term, term);
}

/** I termini significativi digitati dall'utente (per dominare il ranking). */
export function terminiOriginali(query: string): string[] {
  return estraiTermini(query)
    .map((t) => normalizza(t).trim())
    .filter(Boolean);
}

export function ordinaNegoziPerRilevanza<T extends NegozioIndicizzabile>(
  negozi: T[],
  query: string
) {
  const term = estraiTermini(query);
  return [...negozi].sort(
    (a, b) => calcolaPunteggioNegozioConEspansione(b, term, term) - calcolaPunteggioNegozioConEspansione(a, term, term)
  );
}

export function filtraNegoziPerPertinenza<T extends NegozioIndicizzabile>(
  negozi: T[],
  query: string
) {
  const term = estraiTermini(query);
  return filtraNegoziPerPertinenzaConEspansione(negozi, term, term);
}

/**
 * Costruzione del ranking finale dei negozi con separazione origine/espansione
 * e soglia di pertinenza (evita risultati spazzatura con punteggio trascurabile).
 */
export function filtraNegoziPerPertinenzaConEspansione<T extends NegozioIndicizzabile>(
  negozi: T[],
  terminiOriginali: string[],
  terminiEspansi: string[]
) {
  const conPunteggio = negozi
    .map((negozio) => ({
      negozio,
      punteggio: calcolaPunteggioNegozioConEspansione(negozio, terminiOriginali, terminiEspansi),
    }))
    .filter(({ punteggio }) => punteggio > 0);

  if (conPunteggio.length === 0) {
    return [];
  }

  conPunteggio.sort((a, b) => b.punteggio - a.punteggio);

  const topScore = conPunteggio[0]?.punteggio ?? 0;
  if (topScore <= 0) {
    return [];
  }

  // Soglia: mantiene i risultati con punteggio reale (>=8) e quelli vicini al
  // miglior risultato (>=35% del top). I match solo-espansi deboli (es. "salute"
  // in un profilo generico) cadono sotto la soglia.
  const soglia = Math.max(8, Math.ceil(topScore * 0.35));
  const filtrati = conPunteggio
    .filter(({ punteggio }) => punteggio >= soglia)
    .map(({ negozio }) => negozio);

  return filtrati.length > 0 ? filtrati : [conPunteggio[0].negozio];
}
