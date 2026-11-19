import { erroreInput, erroreSchema } from "./errori";
import type { FonteUfficiale } from "./fonti";
import { componiEsito } from "./livelli";
import { buildPromptRadiciScan, VERSIONE_PROMPT } from "./prompt";
import {
  ricercaNonDisponibile,
  ricercaNonEseguita,
} from "./ricerca";
import { analizzaOutputModello } from "./schema";
import {
  MIME_AMMESSI,
  type EsitoAnalisi,
  type IngressoAnalisi,
  type MetaAnalisi,
  type MimeAmmesso,
  type EsitoRicercaDocumentale,
  type ProviderRadiciScan,
  type ProviderRicercaDocumentale,
} from "./tipi";
import { verificaDenominazione } from "./verifica";

/**
 * RadiciScan — pipeline di analisi.
 *
 * Ordine fisso e non negoziabile:
 *   prompt dedicato → provider → schema rigoroso → verifica documentale →
 *   esito classificato.
 *
 * Il modello non vede il registro e non può citare fonti. La verifica
 * avviene dopo, in modo deterministico, sulle sole righe ufficiali.
 * Nessuna immagine viene scritta, salvata o conservata: il buffer base64
 * vive solo nella chiamata al provider.
 */

const RE_IMPRONTA = /^[0-9a-f]{16}$/;

function validaIngresso(ingresso: IngressoAnalisi): {
  base64: string;
  mime: MimeAmmesso;
  impronta: string | null;
} {
  const base64 = ingresso.immagineBase64?.trim() ?? "";
  if (!base64) throw erroreInput("Immagine assente.");
  if (base64.startsWith("data:")) {
    throw erroreInput("Immagine non valida: attesa la sola codifica base64.");
  }

  const mime = ingresso.mimeType?.trim().toLowerCase() ?? "";
  if (!(MIME_AMMESSI as readonly string[]).includes(mime)) {
    throw erroreInput("Formato immagine non supportato.");
  }

  const impronta = ingresso.improntaImmagine?.trim().toLowerCase();
  if (impronta && !RE_IMPRONTA.test(impronta)) {
    throw erroreInput("Impronta immagine non valida.");
  }

  return { base64, mime: mime as MimeAmmesso, impronta: impronta || null };
}

export interface DipendenzeAnalisi {
  provider: ProviderRadiciScan;
  /** Provider documentale: se assente la ricerca è dichiarata non eseguita. */
  ricerca?: ProviderRicercaDocumentale;
  registro: readonly FonteUfficiale[];
  adesso?: Date;
  /** Interruzione richiesta dalla route (timeout complessivo). */
  signal?: AbortSignal;
}

export interface RisultatoAnalisi {
  esito: EsitoAnalisi;
  meta: MetaAnalisi;
  avvisiSchema: string[];
  improntaImmagine: string | null;
}

/** Esegue una singola analisi. Non persiste nulla e non conserva immagini. */
export async function analizzaProdotto(
  ingresso: IngressoAnalisi,
  dipendenze: DipendenzeAnalisi
): Promise<RisultatoAnalisi> {
  const { base64, mime, impronta } = validaIngresso(ingresso);
  const { provider, registro, signal } = dipendenze;

  const inizio = Date.now();
  const { testo } = await provider.genera({
    prompt: buildPromptRadiciScan(),
    immagineBase64: base64,
    mimeType: mime,
    signal,
  });
  const durataMs = Date.now() - inizio;

  const schema = analizzaOutputModello(testo);
  if (!schema.ok) {
    throw erroreSchema(`Output del modello non conforme: ${schema.motivo}`);
  }

  let ricerca: EsitoRicercaDocumentale;
  if (dipendenze.ricerca) {
    try {
      ricerca = await dipendenze.ricerca.cerca({
        riconoscimento: schema.valore.riconoscimento,
        signal,
      });
    } catch {
      // La ricerca esterna è un'informazione aggiuntiva: un suo errore non
      // deve trasformarsi in "nessuna prova" né far fallire l'analisi.
      ricerca = ricercaNonDisponibile();
    }
  } else {
    ricerca = ricercaNonEseguita();
  }

  const verifica = verificaDenominazione(
    schema.valore.riconoscimento,
    registro,
    ricerca
  );
  const esito = componiEsito({
    riconoscimento: schema.valore.riconoscimento,
    verifica,
    versionePrompt: VERSIONE_PROMPT,
  });

  return {
    esito,
    meta: {
      provider: provider.nome,
      modello: provider.modello,
      durataMs,
      versionePrompt: VERSIONE_PROMPT,
    },
    avvisiSchema: schema.valore.avvisi,
    improntaImmagine: impronta,
  };
}
