import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  FileText,
  Globe,
  Info,
  Landmark,
  RotateCcw,
  Search,
  type LucideIcon,
} from "lucide-react";
import type {
  DocumentoLetto,
  EsitoAnalisi,
  LetturaDocumentale,
  ProvaDocumentale,
  SintesiFontiWeb,
  SintesiVerificaWeb,
  ValutazioneProvenienza,
} from "@/lib/radiscan/tipi";
import {
  denominazioneUfficialmenteRegistrata,
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
  // Gli esiti salvati prima di questa versione non hanno `allegati`.
  const allegati = Array.isArray(prova.allegati) ? prova.allegati : [];
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
        {prova.gruppoProduttori ? (
          <div className="sm:col-span-2">
            <dt className="font-bold text-[#6b6459]">Gruppo riconosciuto</dt>
            <dd className="text-[#1b3624]">
              {prova.gruppoProduttori}
              {prova.sedeGruppo ? ` — ${prova.sedeGruppo.replace(/\s+/g, " ")}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      {allegati.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
            Allegati dichiarati dalla scheda ({allegati.length})
          </p>
          <ul className="mt-1.5 space-y-1">
            {allegati.map((allegato) => (
              <li key={allegato.id}>
                <a
                  href={allegato.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[#24462f] underline underline-offset-2"
                >
                  {allegato.titolo}
                </a>
                <span className="ml-1 text-[11px] text-[#8a8378]">
                  ({allegato.tipo === "disciplinare" ? "disciplinare" : "riepilogo"})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

const ETICHETTA_LETTURA: Record<LetturaDocumentale["stato"], string> = {
  completa: "Tutti gli allegati disponibili sono stati letti",
  parziale: "Lettura parziale degli allegati",
  non_disponibile: "Allegati non letti",
  non_tentata: "Nessun allegato documentale da leggere",
};

const STILE_PROVENIENZA: Record<
  ValutazioneProvenienza["territorio"]["stato"],
  string
> = {
  documentato: "border-emerald-200 bg-emerald-50 text-emerald-900",
  non_documentato: "border-amber-200 bg-amber-50 text-amber-900",
  non_verificabile: "border-slate-200 bg-slate-50 text-slate-700",
};

const ETICHETTA_STATO_PROVENIENZA: Record<
  ValutazioneProvenienza["territorio"]["stato"],
  string
> = {
  documentato: "Documentato",
  non_documentato: "Non documentato",
  non_verificabile: "Non verificabile",
};

function SchedaDocumentoLetto({ documento }: { documento: DocumentoLetto }) {
  const associazione = documento.associazionePagine ?? "pagine";
  const unita = associazione === "pagine" ? "pagine" : "sezioni di testo";
  const etichettaBlocco = associazione === "pagine" ? "Pagina" : "Sezione";

  return (
    <article className="rounded-xl border border-[#d8e4da] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black leading-5 text-[#1b3624]">
            {documento.titolo}
          </p>
          <p className="text-[11px] text-[#6b6459]">
            {documento.tipo === "disciplinare"
              ? "Disciplinare (single document)"
              : "Riepilogo ufficiale"}
          </p>
        </div>
        <span className="rd-et">{documento.stato.replaceAll("_", " ")}</span>
      </div>

      <p className="mt-2 text-xs leading-5 text-[#57534e]">
        {associazione === "pagine"
          ? `Pagine lette: ${documento.pagineLette}${
              documento.pagineTotali !== null
                ? ` di ${documento.pagineTotali}`
                : " (totale non dichiarato dal PDF)"
            }${documento.pagineNonLette > 0 ? ` · ${documento.pagineNonLette} non lette` : ""}`
          : `Sezioni di testo lette: ${documento.pagineLette} (il PDF non permette di associarle alle pagine)`}
      </p>

      {documento.motivo ? (
        <p className="mt-1 text-xs leading-5 text-[#8a5a3b]">{documento.motivo}</p>
      ) : null}

      {documento.sezioni.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-[#24462f]">
            Testo estratto ({documento.sezioni.length} {unita})
          </summary>
          <div className="mt-2 space-y-2">
            {documento.sezioni.map((sezione) => (
              <div
                key={sezione.pagina}
                className="rounded-lg border border-[#e5ded0] bg-[#fffdf7] p-2"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
                  {etichettaBlocco} {sezione.pagina}
                </p>
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-5 text-[#57534e]">
                  {sezione.testo}
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <a
        href={documento.url}
        target="_blank"
        rel="noopener noreferrer"
        className="rd-link-freccia mt-2"
      >
        Apri l&apos;allegato ufficiale
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </article>
  );
}

function BloccoLettura({ lettura }: { lettura: LetturaDocumentale }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#24462f]" aria-hidden />
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#24462f]">
          Lettura dei documenti ufficiali
        </p>
      </div>
      <div className="mt-2 rounded-xl border border-[#d8e4da] bg-[#f8fbf8] p-4">
        <p className="text-sm font-black text-[#1b3624]">
          {ETICHETTA_LETTURA[lettura.stato]}
        </p>
        <p className="mt-1 text-xs leading-5 text-[#57534e]">{lettura.messaggio}</p>
        {lettura.notaPagine ? (
          <p className="mt-1 text-[11px] leading-5 text-[#8a8378]">
            {lettura.notaPagine}
          </p>
        ) : null}
        {lettura.documenti.length > 0 ? (
          <div className="mt-3 space-y-2">
            {lettura.documenti.map((documento) => (
              <SchedaDocumentoLetto key={documento.id} documento={documento} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RigaProvenienza({
  titolo,
  stato,
  motivo,
  evidenze,
}: {
  titolo: string;
  stato: ValutazioneProvenienza["territorio"]["stato"];
  motivo: string;
  evidenze: ValutazioneProvenienza["territorio"]["evidenze"];
}) {
  return (
    <div className={`rounded-xl border p-3 ${STILE_PROVENIENZA[stato]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black">{titolo}</p>
        <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]">
          {ETICHETTA_STATO_PROVENIENZA[stato]}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5">{motivo}</p>
      {evidenze.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {evidenze.map((evidenza, indice) => (
            <li key={`${indice}-${evidenza.fonte}`} className="text-[11px] leading-5">
              <span className="font-bold">{evidenza.fonte}</span>
              {evidenza.pagina !== null ? `, pagina ${evidenza.pagina}` : ""}
              <span className="block italic opacity-80">“{evidenza.estratto}”</span>
              {evidenza.url ? (
                <a
                  href={evidenza.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Apri la fonte
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BloccoProvenienza({
  provenienza,
}: {
  provenienza: ValutazioneProvenienza;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-[#24462f]" aria-hidden />
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#24462f]">
          Denominazione, territorio, filiera e confezione
        </p>
      </div>

      <div className="mt-2 space-y-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black">Confezione fotografata</p>
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]">
              Non verificabile
            </span>
          </div>
          <p className="mt-1 text-xs leading-5">{provenienza.confezione.messaggio}</p>
        </div>

        <RigaProvenienza
          titolo="Collegamento con la Calabria"
          stato={provenienza.territorio.stato}
          motivo={provenienza.territorio.motivo}
          evidenze={provenienza.territorio.evidenze}
        />

        <div className="rounded-xl border border-[#d8e4da] bg-[#f8fbf8] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-[#1b3624]">
              Appartenenza a una filiera riconosciuta
            </p>
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#57534e]">
              {ETICHETTA_STATO_PROVENIENZA[provenienza.filiera.stato]}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#57534e]">
            {provenienza.filiera.motivo}
          </p>
          {provenienza.filiera.evidenze.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {provenienza.filiera.evidenze.map((evidenza) => (
                <li key={evidenza.fonte} className="text-[11px] leading-5 text-[#57534e]">
                  <span className="font-bold">{evidenza.fonte}</span>: {evidenza.estratto}
                  {evidenza.url ? (
                    <>
                      {" "}
                      <a
                        href={evidenza.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        Apri la fonte
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ETICHETTA_ATTENDIBILITA = {
  alta: "Attendibilità alta",
  media: "Attendibilità media",
  bassa: "Attendibilità bassa",
} as const;

const ETICHETTA_STATO_SINTESI: Record<SintesiVerificaWeb["stato"], string> = {
  registrata: "Registrata",
  menzionata: "Menzionata",
  dichiarata: "Dichiarata dal produttore",
  supportata: "Supportata da fonti indipendenti",
  non_confermata: "Non confermata dalle fonti",
  non_verificabile: "Non verificabile",
};

const ETICHETTA_DICHIARAZIONE: Record<string, string> = {
  aziendale: "Dichiarazione aziendale",
  indipendente: "Fonte indipendente",
  informativa: "Fonte informativa",
  non_determinata: "Origine non determinata",
};

function RigaSintesiWeb({
  titolo,
  voce,
}: {
  titolo: string;
  voce: SintesiVerificaWeb | { stato: "non_verificabile"; testo: string };
}) {
  const fonti = "fonti" in voce ? voce.fonti : [];
  const positivo = voce.stato === "registrata" || voce.stato === "supportata";
  return (
    <div
      className={
        positivo
          ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3"
          : voce.stato === "non_confermata" || voce.stato === "non_verificabile"
            ? "rounded-lg border border-[#e5ded0] bg-[#fffdf7] p-3"
            : "rounded-lg border border-amber-200 bg-amber-50 p-3"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black leading-5 text-[#1b3624]">{titolo}</p>
        <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#57534e]">
          {ETICHETTA_STATO_SINTESI[voce.stato]}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#57534e]">{voce.testo}</p>
      {fonti.length > 0 ? (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
          {fonti.map((url, indice) => (
            <a
              key={`${url}-${indice}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#24462f] underline underline-offset-2"
            >
              Fonte {indice + 1}
            </a>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function BloccoSintesiFonti({ sintesi }: { sintesi: SintesiFontiWeb }) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
        Verifiche separate · non sono la stessa cosa
      </p>
      <RigaSintesiWeb titolo="A. Denominazione DOP/IGP registrata" voce={sintesi.denominazione} />
      <RigaSintesiWeb titolo="B. Produttore collegato alla denominazione" voce={sintesi.produttore} />
      <RigaSintesiWeb titolo="C. Marchio commerciale" voce={sintesi.marchio} />
      <RigaSintesiWeb titolo="D. Prodotto specifico" voce={sintesi.prodotto} />
      <RigaSintesiWeb titolo="E. Autenticità della singola confezione e del lotto" voce={sintesi.confezione} />
    </div>
  );
}

const ETICHETTA_NATURA: Record<string, string> = {
  ufficiale_eu: "Fonte ufficiale UE",
  ufficiale_it: "Fonte ufficiale italiana",
  regionale: "Fonte regionale",
  consorzio: "Consorzio di tutela",
  produttore: "Sito del produttore",
  database_prodotti: "Banca dati prodotti",
  informativo: "Fonte informativa",
  commerciale: "Fonte commerciale",
};

const ETICHETTA_CONTROLLO: Record<string, string> = {
  documentato: "Documentato",
  non_documentato: "Non documentato",
  non_verificabile: "Non verificabile",
  incoerente: "Da controllare",
};

function BloccoMultifonte({ esito }: { esito: EsitoAnalisi }) {
  const ocr = esito.ocr ?? null;
  const etichetta = esito.etichetta ?? null;
  const discrepanze = Array.isArray(esito.discrepanze) ? esito.discrepanze : [];
  const web = esito.web ?? null;
  const barcode = esito.barcode ?? null;
  const produttore = esito.produttore ?? null;
  const tempi = esito.tempi ?? null;

  const campi = etichetta
    ? [
        ["Nome commerciale", etichetta.nomeCommerciale],
        ["Denominazione legale", etichetta.denominazioneLegale],
        ["Produttore", etichetta.produttore],
        ["Stabilimento", etichetta.stabilimento],
        ["Indirizzo", etichetta.indirizzo],
        ["Lotto", etichetta.lotto],
        ["Codice a barre", etichetta.codiceBarre],
      ].filter(([, campo]) => (campo as { valore: string | null }).valore)
    : [];

  if (!ocr && !etichetta && discrepanze.length === 0 && !web && !barcode && !produttore) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {ocr ? (
        <div className="rounded-xl border border-[#d8e4da] bg-[#f8fbf8] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-[#24462f]" aria-hidden />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#24462f]">
                Lettura OCR dell&apos;etichetta
              </p>
            </div>
            <span className="rd-et">
              {ocr.stato === "ok"
                ? `Confidenza ${ocr.confidenza}% · ${ocr.paroleLette} parole`
                : "OCR non disponibile"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#57534e]">
            {ocr.stato === "ok"
              ? "Questa è la trascrizione del motore OCR: resta separata dalle ipotesi del modello visivo."
              : ocr.motivo ?? "Nessun testo letto."}
          </p>
          {ocr.stato === "ok" && ocr.testo ? (
            <details className="mt-2 rounded-lg border border-[#e5ded0] bg-white p-3">
              <summary className="cursor-pointer text-xs font-bold text-[#1b3624]">
                Testo letto ({ocr.caratteri} caratteri)
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#57534e]">
                {ocr.testo}
              </pre>
            </details>
          ) : null}
          {ocr.avvisi.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs leading-5 text-[#8a5a3b]">
              {ocr.avvisi.map((avviso) => (
                <li key={avviso}>• {avviso}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {etichetta ? (
        <div className="rounded-xl border border-[#e5ded0] bg-[#fffdf7] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#8a5a3b]" aria-hidden />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a5a3b]">
                Dati estratti dall&apos;etichetta
              </p>
            </div>
            <span className="rd-et">Leggibilità {etichetta.leggibilita}</span>
          </div>
          {campi.length > 0 ? (
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {campi.map(([nome, campo]) => {
                const valore = (campo as { valore: string | null }).valore!;
                const fonte = (campo as { fonte: string | null }).fonte;
                return (
                  <div key={nome as string} className="rd-dato">
                    <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
                      {nome as string}
                    </dt>
                    <dd className="mt-1 text-sm font-bold leading-5 text-[#1b3624]">
                      {valore}{" "}
                      {fonte ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a8378]">
                          ({fonte === "ocr_e_ai" ? "OCR e modello" : fonte})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#57534e]">
              Nessun campo strutturato è stato letto con sufficiente certezza.
            </p>
          )}
          {etichetta.certificazioni.length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8378]">
                Sigle e certificazioni lette
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {etichetta.certificazioni.map((voce) => (
                  <li key={voce} className="rd-et">
                    {voce}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {etichetta.ingredienti.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-[#57534e]">
              <span className="font-bold text-[#1b3624]">Ingredienti: </span>
              {etichetta.ingredienti.join(", ")}
            </p>
          ) : null}
          {etichetta.territorioDichiarato.length > 0 ? (
            <p className="mt-2 text-xs leading-5 text-[#57534e]">
              <span className="font-bold text-[#1b3624]">Territorio dichiarato: </span>
              {etichetta.territorioDichiarato.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {discrepanze.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-900">
              Discrepanze OCR / modello ({discrepanze.length})
            </p>
          </div>
          <ul className="mt-2 space-y-2 text-xs leading-5 text-amber-900">
            {discrepanze.map((voce, indice) => (
              <li key={`${voce.campo}-${indice}`}>
                <span className="font-bold uppercase tracking-[0.06em]">
                  {voce.campo} · gravità {voce.gravita}
                </span>
                <p className="mt-0.5">{voce.messaggio}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {barcode ? (
        <div className="rounded-xl border border-[#d8e4da] bg-[#f8fbf8] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#24462f]">
            Banca dati prodotti · {barcode.fonte}
          </p>
          <p className="mt-2 text-sm font-bold text-[#1b3624]">
            {barcode.trovato
              ? `${barcode.nome ?? "Prodotto senza nome"}${barcode.marchio ? ` · ${barcode.marchio}` : ""}`
              : "Nessuna scheda trovata"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#57534e]">
            Codice {barcode.codice} · {barcode.messaggio}
          </p>
          {barcode.etichette.length > 0 ? (
            <p className="mt-1 text-xs leading-5 text-[#57534e]">
              Etichette dichiarate nella banca dati: {barcode.etichette.join(", ")}
            </p>
          ) : null}
          <a
            href={barcode.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#24462f] underline"
          >
            Scheda OpenFoodFacts <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      ) : null}

      {web && web.stato !== "non_eseguita" ? (
        <div className="rounded-xl border border-[#d8e4da] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#24462f]" aria-hidden />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#24462f]">
                FONTI TROVATE ({web.fonti.length})
              </p>
            </div>
            <span className="rd-et">
              {web.stato === "ok"
                ? `${web.motore === "tavily" ? "Tavily Search" : web.motore === "google_grounding" ? "Google Search" : "Motori web"}${web.consumi ? ` · ${web.consumi.creditiTotali} crediti` : ""} · ${web.consultataIl ?? "data non disponibile"}`
                : "Non disponibile"}
            </span>
          </div>
          {web.messaggio ? (
            <p className="mt-2 text-xs leading-5 text-[#8a5a3b]">{web.messaggio}</p>
          ) : null}
          {web.sintesi ? <BloccoSintesiFonti sintesi={web.sintesi} /> : null}
          {web.fonti.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {web.fonti.map((fonte) => (
                <li key={fonte.id} className="rounded-lg border border-[#e5ded0] bg-[#fffdf7] p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rd-et">{ETICHETTA_NATURA[fonte.natura] ?? fonte.natura}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8a8378]">
                      {ETICHETTA_ATTENDIBILITA[fonte.attendibilita]}
                    </span>
                    {fonte.dichiarazione ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8a5a3b]">
                        {ETICHETTA_DICHIARAZIONE[fonte.dichiarazione] ?? fonte.dichiarazione}
                      </span>
                    ) : null}
                    {fonte.lettoIntegralmente ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-800">
                        Documento letto
                      </span>
                    ) : fonte.metodoLettura === "tavily_extract" ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8a5a3b]">
                        Estratto con Tavily
                      </span>
                    ) : fonte.pagineLette ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8a8378]">
                        {fonte.pagineLette} pagine lette
                      </span>
                    ) : null}
                  </div>
                  <a
                    href={fonte.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-start gap-1 text-sm font-bold leading-5 text-[#1b3624] underline"
                  >
                    {fonte.titolo}
                    <ExternalLink className="mt-1 h-3 w-3 shrink-0" aria-hidden />
                  </a>
                  <p className="mt-0.5 text-xs leading-5 text-[#57534e]">
                    {fonte.ente} · consultata il {fonte.consultataIl}
                  </p>
                  {fonte.estratto ? (
                    <p className="mt-1 line-clamp-4 text-xs leading-5 text-[#57534e]">
                      {fonte.estratto}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {produttore ? (
        <div className="rounded-xl border border-[#e5ded0] bg-[#fffdf7] p-4">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[#8a5a3b]" aria-hidden />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a5a3b]">
              Produttore e filiera · controlli separati
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#57534e]">{produttore.sintesi}</p>
          <ul className="mt-2 space-y-1.5">
            {produttore.controlli.map((controllo) => (
              <li key={controllo.id} className="text-xs leading-5">
                <span className="font-bold text-[#1b3624]">{controllo.etichetta}: </span>
                <span
                  className={
                    controllo.stato === "documentato"
                      ? "font-bold text-emerald-800"
                      : controllo.stato === "incoerente"
                        ? "font-bold text-amber-800"
                        : "font-bold text-[#6b6459]"
                  }
                >
                  {ETICHETTA_CONTROLLO[controllo.stato] ?? controllo.stato}
                </span>
                <span className="text-[#57534e]"> — {controllo.dettaglio}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tempi ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e5ded0] bg-white px-4 py-3 text-[11px] font-semibold text-[#6b6459]">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <span>Tempi reali:</span>
          <span>visione {((tempi.preprocessamentoMs ?? 0) / 1000).toFixed(1)} s</span>
          <span>identificazione {(tempi.identificazioneMs / 1000).toFixed(1)} s</span>
          <span>OCR {(tempi.ocrMs / 1000).toFixed(1)} s</span>
          <span>documenti {(tempi.documentiMs / 1000).toFixed(1)} s</span>
          <span>web {(tempi.webMs / 1000).toFixed(1)} s</span>
          <span className="font-black text-[#1b3624]">totale {(tempi.totaleMs / 1000).toFixed(1)} s</span>
        </div>
      ) : null}
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
  const riconoscimento = esito.riconoscimento;
  const prove = Array.isArray(esito.verifica?.prove) ? esito.verifica.prove : [];
  const denominazioneLetta = Boolean(
    riconoscimento.denominazioneProposta?.trim()
  );
  const denominazioneUeRegistrata =
    denominazioneLetta && denominazioneUfficialmenteRegistrata(prove);
  // Una DOP, IGP o STG esatta e attiva in eAmbrosia è un riscontro positivo,
  // anche se gli allegati accessori non sono tutti disponibili. Non equivale
  // all'autenticazione della singola confezione, del lotto o del produttore.
  const riscontroOnlineDop =
    !dopUfficialmenteRegistrata &&
    esito.web?.sintesi?.denominazione.stato === "menzionata";
  const identificazioneCompletata =
    esito.livello === "non_verificato" &&
    typeof riconoscimento.prodotto === "string" &&
    riconoscimento.prodotto.trim().length > 0;
  const gruppo = dopUfficialmenteRegistrata
    ? "verificato"
    : riscontroOnlineDop
      ? "non_documentato"
      : gruppoDaLivello(esito.livello);
  const stile = STILE[gruppo];
  const etichetta = dopUfficialmenteRegistrata
    ? {
        titolo: "Denominazione ufficialmente registrata",
        descrizione:
          "La corrispondenza esatta risulta registrata in eAmbrosia, il registro ufficiale dell'Unione europea. La documentazione accessoria può essere incompleta: il riconoscimento della denominazione non autentica la singola confezione, il lotto o il produttore.",
      }
    : riscontroOnlineDop
      ? {
          titolo: "DOP/IGP con riscontri online",
          descrizione: denominazioneLetta
            ? "Sono state trovate fonti online pertinenti che riportano questa denominazione come DOP/IGP. È un riscontro positivo sulla presenza della denominazione nelle fonti; la conferma del registro ufficiale e l'autenticità della singola confezione restano controlli separati."
            : `Le fonti online pertinenti associano il nome prodotto specifico "${riconoscimento.prodotto}" a una denominazione DOP/IGP. La denominazione non è stata letta in etichetta: il riscontro riguarda il nome del prodotto, non una certificazione ufficiale. La conferma del registro e l'autenticità della singola confezione restano controlli separati.`,
        }
      : identificazioneCompletata
        ? {
            titolo: "Prodotto identificato",
            descrizione:
              "Il motore visivo ha letto il prodotto dalla fotografia. La verifica documentale DOP/IGP è un controllo separato: l'assenza di una corrispondenza nel registro non significa che il prodotto sia falso o non autentico.",
          }
        : ETICHETTE_GRUPPO[gruppo];
  const Icona = stile.icona;

  const indicatore = Array.isArray(riconoscimento.indicatoriEtichetta)
    ? riconoscimento.indicatoriEtichetta
    : [];
  const incongruenze = Array.isArray(riconoscimento.incongruenzeRilevate)
    ? riconoscimento.incongruenzeRilevate
    : [];
  const fonte = esito.verifica?.fonte ?? null;
  const ricerca = esito.verifica?.ricerca ?? null;
  const lettura = ricerca?.lettura ?? null;
  const provenienza = esito.verifica?.provenienza ?? null;
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
              Verifica documentale DOP/IGP
            </p>
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#6b6459]">
            Questo controllo riguarda la presenza della denominazione nei registri ufficiali, non il riconoscimento del prodotto né la sua autenticità.
          </p>
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

        {lettura ? <BloccoLettura lettura={lettura} /> : null}

        {fonte ? <SchedaFonte fonte={fonte} /> : null}

        {provenienza ? <BloccoProvenienza provenienza={provenienza} /> : null}

        <BloccoMultifonte esito={esito} />

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
