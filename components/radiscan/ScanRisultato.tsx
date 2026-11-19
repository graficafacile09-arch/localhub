import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileText,
  Info,
  Landmark,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type { EsitoAnalisi, ProvaDocumentale } from "@/lib/radiscan/tipi";
import {
  ETICHETTE_GRUPPO,
  gruppoDaLivello,
  type GruppoEsito,
} from "./logica";

const STILE: Record<
  GruppoEsito,
  { icona: LucideIcon; cornice: string; iconaSfondo: string }
> = {
  verificato: {
    icona: CheckCircle2,
    cornice: "border-emerald-200 bg-emerald-50",
    iconaSfondo: "bg-emerald-700 text-white",
  },
  non_documentato: {
    icona: Info,
    cornice: "border-amber-200 bg-amber-50",
    iconaSfondo: "bg-amber-600 text-white",
  },
  non_verificato: {
    icona: Info,
    cornice: "border-slate-200 bg-slate-50",
    iconaSfondo: "bg-slate-600 text-white",
  },
  incongruenza: {
    icona: AlertTriangle,
    cornice: "border-red-200 bg-red-50",
    iconaSfondo: "bg-red-700 text-white",
  },
};

function Campo({
  etichetta,
  valore,
}: {
  etichetta: string;
  valore: string | null | undefined;
}) {
  return (
    <div className="rd-dato">
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
        {etichetta}
      </dt>
      <dd className="mt-1 text-sm font-bold leading-5 text-[#1b3624]">
        {valore?.trim() || "Non indicato"}
      </dd>
    </div>
  );
}

const ETICHETTA_PROVA: Record<ProvaDocumentale["tipo"], string> = {
  ufficiale: "Fonte ufficiale",
  informativa: "Fonte informativa",
  risultato_ricerca: "Risultato di ricerca",
};

function SchedaProva({ prova }: { prova: ProvaDocumentale }) {
  const documentoDiverso =
    prova.documentoUrl && prova.documentoUrl !== prova.url
      ? prova.documentoUrl
      : null;

  return (
    <article className="rounded-xl border border-[#d8e4da] bg-[#f8fbf8] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="rd-et">{ETICHETTA_PROVA[prova.tipo]}</span>
          <h4 className="mt-2 text-sm font-black leading-5 text-[#1b3624]">
            {prova.titolo}
          </h4>
          <p className="mt-0.5 text-xs leading-5 text-[#57534e]">{prova.ente}</p>
        </div>
        <Landmark className="h-5 w-5 shrink-0 text-[#24462f]" aria-hidden />
      </div>

      {prova.estratto ? (
        <p className="mt-3 rounded-lg border border-[#e5ded0] bg-white px-3 py-2 text-xs leading-5 text-[#57534e]">
          {prova.estratto}
        </p>
      ) : null}

      <p className="mt-2 text-xs leading-5 text-[#57534e]">{prova.relazione}</p>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[#6b6459]">Stato</dt>
          <dd className="text-[#1b3624]">
            {prova.stato.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-[#6b6459]">Consultata il</dt>
          <dd className="text-[#1b3624]">{prova.consultataIl}</dd>
        </div>
        {prova.schemaQualita ? (
          <div>
            <dt className="font-bold text-[#6b6459]">Schema</dt>
            <dd className="text-[#1b3624]">{prova.schemaQualita}</dd>
          </div>
        ) : null}
        {prova.riferimentoNormativo ? (
          <div className={prova.schemaQualita ? undefined : "sm:col-span-2"}>
            <dt className="font-bold text-[#6b6459]">Riferimento</dt>
            <dd className="text-[#1b3624]">{prova.riferimentoNormativo}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <a
          href={prova.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rd-link-freccia"
        >
          Apri la scheda ufficiale
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        {documentoDiverso ? (
          <a
            href={documentoDiverso}
            target="_blank"
            rel="noopener noreferrer"
            className="rd-link-freccia"
          >
            Apri il documento originale
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function AvvisoRicerca({
  ricerca,
}: {
  ricerca: EsitoAnalisi["verifica"]["ricerca"] | null | undefined;
}) {
  if (!ricerca) return null;

  if (ricerca.stato === "non_disponibile") {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-900">
              Ricerca non completata
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              {ricerca.messaggio ??
                "Il registro ufficiale non ha risposto. Questo esito non dimostra l'assenza di fonti."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (ricerca.stato === "non_eseguita") {
    return (
      <p className="mt-4 rounded-xl border border-[#e5ded0] bg-white p-4 text-xs leading-5 text-[#6b6459]">
        {ricerca.messaggio ?? "Ricerca documentale non eseguita."}
      </p>
    );
  }

  return (
    <p className="mt-4 rounded-xl border border-[#e5ded0] bg-white p-4 text-xs leading-5 text-[#6b6459]">
      Nessun documento pertinente è stato trovato nel registro eAmbrosia
      consultato il {ricerca.consultataIl ?? "data non disponibile"}. L&apos;assenza
      di risultati non dimostra che la denominazione non esista.
    </p>
  );
}

function SchedaFonte({
  fonte,
}: {
  fonte: NonNullable<EsitoAnalisi["verifica"]["fonte"]>;
}) {
  return (
    <div className="mt-4 rounded-xl border border-[#d8e4da] bg-[#f4f8f4] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#24462f]">
            Fonte ufficiale registrata
          </p>
          <p className="mt-1 text-sm font-black leading-5 text-[#1b3624]">
            {fonte.denominazione}
          </p>
          <p className="text-xs text-[#57534e]">{fonte.ente}</p>
        </div>
        <Award className="h-5 w-5 shrink-0 text-[#d5a83a]" aria-hidden />
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[#6b6459]">Schema di qualità</dt>
          <dd className="text-[#1b3624]">{fonte.schemaQualita ?? "Non indicato"}</dd>
        </div>
        <div>
          <dt className="font-bold text-[#6b6459]">Territorio</dt>
          <dd className="text-[#1b3624]">{fonte.territorio ?? "Non indicato"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-bold text-[#6b6459]">Riferimento normativo</dt>
          <dd className="text-[#1b3624]">{fonte.riferimentoNormativo}</dd>
        </div>
        <div>
          <dt className="font-bold text-[#6b6459]">Consultata il</dt>
          <dd className="text-[#1b3624]">{fonte.consultataIl}</dd>
        </div>
      </dl>

      <a
        href={fonte.urlUfficiale}
        target="_blank"
        rel="noopener noreferrer"
        className="rd-link-freccia mt-3"
      >
        Apri la fonte ufficiale
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}

export default function ScanRisultato({
  esito,
  cache,
  onReset,
}: {
  esito: EsitoAnalisi;
  cache: boolean;
  onReset: () => void;
}) {
  const gruppo = gruppoDaLivello(esito.livello);
  const stile = STILE[gruppo];
  const etichetta = ETICHETTE_GRUPPO[gruppo];
  const Icona = stile.icona;

  const riconoscimento = esito.riconoscimento;
  const indicatore = Array.isArray(riconoscimento.indicatoriEtichetta)
    ? riconoscimento.indicatoriEtichetta
    : [];
  const incongruenze = Array.isArray(riconoscimento.incongruenzeRilevate)
    ? riconoscimento.incongruenzeRilevate
    : [];
  const fonte = esito.verifica?.fonte ?? null;
  const prove = Array.isArray(esito.verifica?.prove) ? esito.verifica.prove : [];
  const ricerca = esito.verifica?.ricerca ?? null;
  const motivazione =
    esito.verifica?.motivazione?.trim() || "Nessuna motivazione disponibile.";
  const avvertenza =
    esito.avvertenza?.trim() ||
    "RadiciScan non certifica l'autenticità di un prodotto.";

  return (
    <section className="rd-scheda mt-5 overflow-hidden" aria-live="polite">
      <div className={`border-b p-5 md:p-6 ${stile.cornice}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stile.iconaSfondo}`}
            >
              <Icona className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6b6459]">
                Esito RadiciScan
              </p>
              <h2 className="mt-0.5 text-xl font-black leading-tight text-[#1b3624] md:text-2xl">
                {etichetta.titolo}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#57534e]">
                {etichetta.descrizione}
              </p>
            </div>
          </div>
          {cache ? (
            <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#57534e]">
              Esito riutilizzato dalla cache
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-lg font-black leading-tight text-[#1b3624] md:text-xl">
            {riconoscimento.prodotto?.trim() || "Prodotto non identificato"}
          </h3>
          {riconoscimento.categoria ? (
            <span className="rd-et">{riconoscimento.categoria}</span>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <Campo
            etichetta="Denominazione letta"
            valore={riconoscimento.denominazioneProposta}
          />
          <Campo
            etichetta="Territorio indicato"
            valore={riconoscimento.territorioProposto}
          />
          <Campo
            etichetta="Schema di qualità indicato"
            valore={riconoscimento.schemaProposto}
          />
          <Campo etichetta="Categoria" valore={riconoscimento.categoria} />
        </dl>

        {indicatore.length > 0 ? (
          <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
              Indicazioni lette dall&apos;etichetta
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {indicatore.map((voce) => (
                <li key={voce} className="rd-et">
                  {voce}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {esito.denominazioneVerificata ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-emerald-900">
            Denominazione confermata: {esito.denominazioneVerificata}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-[#e5ded0] bg-[#fffdf7] p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#8a5a3b]" aria-hidden />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a5a3b]">
              Verifica documentale
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#57534e]">{motivazione}</p>
        </div>

        {prove.length > 0 ? (
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-[#24462f]" aria-hidden />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#24462f]">
                Prove documentali ({prove.length})
              </p>
            </div>
            {ricerca?.messaggio ? (
              <p className="mt-2 text-xs leading-5 text-[#8a5a3b]">
                {ricerca.messaggio}
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              {prove.map((prova) => (
                <SchedaProva key={prova.id} prova={prova} />
              ))}
            </div>
          </div>
        ) : (
          <AvvisoRicerca ricerca={ricerca} />
        )}

        {fonte ? <SchedaFonte fonte={fonte} /> : null}

        {incongruenze.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-900">
                Segnalazioni da controllare
              </p>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-amber-900">
              {incongruenze.map((voce, indice) => (
                <li key={`${indice}-${voce}`} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{voce}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {riconoscimento.note ? (
          <div className="mt-4 rounded-xl border border-[#e5ded0] bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a8378]">
              Nota dal riconoscimento
            </p>
            <p className="mt-1 text-sm leading-6 text-[#57534e]">
              {riconoscimento.note}
            </p>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-[#e8dfc9] bg-[#fbf6e8] p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#8a5a3b]" aria-hidden />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a5a3b]">
                Avvertenza
              </p>
              <p className="mt-1 text-xs leading-5 text-[#57534e]">{avvertenza}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#1b3624]">
                RadiciScan verifica la documentazione della denominazione, non
                certifica il singolo esemplare.
              </p>
            </div>
          </div>
        </div>

        <button type="button" onClick={onReset} className="rd-azione-tenue mt-5">
          <RotateCcw className="h-4 w-4" aria-hidden />
          Nuova analisi
        </button>
      </div>
    </section>
  );
}
