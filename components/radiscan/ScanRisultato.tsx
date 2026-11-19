import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type { EsitoAnalisi } from "@/lib/radiscan/tipi";
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

        {fonte ? (
          <SchedaFonte fonte={fonte} />
        ) : (
          <p className="mt-4 rounded-xl border border-[#e5ded0] bg-white p-4 text-xs leading-5 text-[#6b6459]">
            Nessuna fonte ufficiale è associata a questo esito. Il riconoscimento
            resta un&apos;indicazione da controllare.
          </p>
        )}

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
