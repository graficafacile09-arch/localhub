import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Leaf, MapPin } from "lucide-react";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import { getSiteUrl } from "@/lib/site";
import {
  ABBREVIAZIONI_MESI,
  CATEGORIE,
  FONTI,
  NOMI_MESI,
  PERIODI,
  VOCI,
  etichettaMesi,
  meseCorrente,
  periodoCorrente,
  vociDelPeriodo,
  type FonteId,
  type Mese,
  type Voce,
} from "@/lib/stagionalita/calendario";
import { immagineVoce } from "@/lib/stagionalita/immagini";

/**
 * CALENDARIO ANNUALE — pagina di approfondimento aperta dal widget in header.
 * Testo e tabelle, nessuna fotografia. Tutti i dati arrivano da
 * `lib/stagionalita/calendario.ts`: qui non si scrivono periodi.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stagionalità",
  description:
    "Cosa si coltiva, si raccoglie, si produce e si trasforma in Calabria durante l'anno: calendario delle produzioni agroalimentari con periodi, zone e fonti.",
  openGraph: {
    title: "Stagionalità",
    description:
      "Cosa si coltiva, si raccoglie, si produce e si trasforma in Calabria durante l'anno: calendario delle produzioni agroalimentari con periodi, zone e fonti.",
    url: `${getSiteUrl()}/stagionalita`,
    type: "website",
    siteName: "Radici Calabria",
  },
  alternates: { canonical: `${getSiteUrl()}/stagionalita` },
};

function StrisciaMesi({ mesi }: { mesi: Mese[] }) {
  return (
    <div>
      <p className="sr-only">Mesi di attività: {etichettaMesi(mesi)}</p>
      <ul className="mt-2 grid grid-cols-12 gap-0.5" aria-hidden="true">
        {NOMI_MESI.map((nome, indice) => {
          const mese = (indice + 1) as Mese;
          const attivo = mesi.includes(mese);
          return (
            <li
              key={nome}
              title={nome}
              className={
                attivo
                  ? "rounded bg-[#24462f] py-1 text-center text-[9px] font-semibold text-white"
                  : "rounded bg-slate-100 py-1 text-center text-[9px] text-slate-400"
              }
            >
              {ABBREVIAZIONI_MESI[indice]}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FontiInline({ fonti }: { fonti: FonteId[] }) {
  return (
    <p className="mt-2 text-[11px] leading-5 text-[#8a8378]">
      Fonti:{" "}
      {fonti.map((fonte, indice) => (
        <span key={fonte}>
          {indice > 0 && " · "}
          <a href={`#fonte-${fonte}`} className="underline decoration-dotted hover:text-[#57534e]">
            {FONTI[fonte].breve}
          </a>
        </span>
      ))}
    </p>
  );
}

function SchedaVoce({ voce }: { voce: Voce }) {
  const immagine = immagineVoce(voce.id);
  return (
    <li className="rounded-xl border border-[#e5ded0] bg-white p-4">
      <div className="flex items-start gap-3">
        {immagine && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={immagine}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="mt-0.5 h-10 w-10 shrink-0 object-contain"
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-bold text-[#1c2b22]">{voce.nome}</h3>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a5a3b]">
              {etichettaMesi(voce.mesi)}
            </p>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#57534e]">{voce.sintesi}</p>
        </div>
      </div>

      {voce.fasi && voce.fasi.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#57534e]">
          {voce.fasi.map((fase) => (
            <li key={fase.etichetta}>
              {fase.etichetta}: <span className="font-medium text-[#57534e]">{etichettaMesi(fase.mesi)}</span>
            </li>
          ))}
        </ul>
      )}

      {voce.zone && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[#57534e]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          {voce.zone}
        </p>
      )}

      <StrisciaMesi mesi={voce.mesi} />

      {voce.nota && <p className="mt-2 text-xs leading-5 text-[#8a8378]">{voce.nota}</p>}

      <FontiInline fonti={voce.fonti} />
    </li>
  );
}

export default function StagionalitaPage() {
  const mese = meseCorrente();
  const periodo = periodoCorrente();

  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Radici Calabria · servizio informativo"
        titolo="Stagionalità in Calabria"
        icona={Leaf}
        idTitolo="titolo-stagionalita"
        sommario="Cosa si coltiva, si raccoglie, si produce e si trasforma in Calabria durante l'anno. Il calendario non è collegato al catalogo commerciale: i periodi indicati riguardano le attività agricole e di trasformazione, non la disponibilità di vendita."
      />

      <div className="rd-guscio py-8 md:py-12">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e8dfc9] bg-[#fbf6e8] px-4 py-3">
          <CalendarDays className="h-5 w-5 shrink-0 text-[#8a5a3b]" aria-hidden />
          <p className="text-sm text-[#3f3a2e]">
            <span className="font-bold">Periodo in corso:</span> {periodo.titolo} — {NOMI_MESI[mese - 1]}
          </p>
          <p className="text-xs text-[#6b6459]">
            La finestra del widget si aggiorna automaticamente con la data.
          </p>
        </div>

        <p className="mt-4 rounded-xl border border-[#e5ded0] bg-white px-4 py-3 text-xs leading-5 text-[#57534e]">
          I periodi sono fasce indicative: variano per cultivar, quota, esposizione e andamento
          stagionale. Dove la differenza tra zone è rilevante è indicata nella scheda. Le fonti
          documentali sono elencate in fondo alla pagina.
        </p>

        {CATEGORIE.map((categoria) => {
          const voci = VOCI.filter((voce) => voce.categoria === categoria.id);
          if (voci.length === 0) return null;
          const idSezione = `categoria-${categoria.id}`;

          return (
            <section key={categoria.id} aria-labelledby={idSezione} className="mt-10">
              <h2
                id={idSezione}
                className="rd-titolo-sezione text-xl md:text-2xl"
              >
                {categoria.titolo}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#57534e]">{categoria.descrizione}</p>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {voci.map((voce) => (
                  <SchedaVoce key={voce.id} voce={voce} />
                ))}
              </ul>
            </section>
          );
        })}

        <section aria-labelledby="calendario-periodi" className="mt-12">
          <h2
            id="calendario-periodi"
            className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5a3b] md:text-sm"
          >
            Calendario per periodo
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#57534e]">
            Le attività raggruppate nei sei bimestri dell&apos;anno.
          </p>

          <div className="mt-4 space-y-3">
            {PERIODI.map((blocco) => {
              const voci = vociDelPeriodo(blocco);
              const attivo = blocco.id === periodo.id;

              return (
                <details
                  key={blocco.id}
                  open={attivo}
                  className={
                    attivo
                      ? "rounded-xl border border-[#d5a83a] bg-white p-4 shadow-sm"
                      : "rounded-xl border border-[#e5ded0] bg-white p-4"
                  }
                >
                  <summary className="cursor-pointer text-sm font-bold text-[#1c2b22]">
                    {blocco.titolo}
                    {attivo && <span className="ml-2 text-[11px] font-semibold text-[#8a5a3b]">periodo in corso</span>}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {CATEGORIE.map((categoria) => {
                      const delGruppo = voci.filter((voce) => voce.categoria === categoria.id);
                      if (delGruppo.length === 0) return null;
                      return (
                        <p key={categoria.id} className="text-xs leading-5 text-[#57534e]">
                          <span className="font-semibold uppercase tracking-wide text-[#8a5a3b]">
                            {categoria.titolo}:
                          </span>{" "}
                          {delGruppo.map((voce) => `${voce.nome} (${voce.sintesi})`).join("; ")}.
                        </p>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section id="fonti" aria-labelledby="titolo-fonti" className="mt-12 scroll-mt-20">
          <h2
            id="titolo-fonti"
            className="text-xs font-black uppercase tracking-[0.18em] text-[#8a5a3b] md:text-sm"
          >
            Fonti documentali
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#57534e]">
            ARSAC Calabria, Regione Calabria (elenco PAT) e MASAF (disciplinari DOP e IGP), con
            documentazione tecnica di supporto.
          </p>

          <ul className="mt-4 space-y-3">
            {(Object.keys(FONTI) as FonteId[]).map((chiave) => (
              <li
                key={chiave}
                id={`fonte-${chiave}`}
                className="scroll-mt-20 rounded-xl border border-[#e5ded0] bg-white p-4"
              >
                <a
                  href={FONTI[chiave].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[#8a5a3b] underline decoration-dotted hover:text-[#1b3624]"
                >
                  {FONTI[chiave].titolo}
                </a>
                <p className="mt-1 text-xs leading-5 text-[#57534e]">{FONTI[chiave].nota}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-xs leading-5 text-[#8a8378]">
          Servizio informativo autonomo di Radici Calabria. Non è collegato al catalogo prodotti, alle
          schede dei venditori o alle disponibilità di vendita.{" "}
          <Link href="/" className="font-semibold text-[#8a5a3b] underline decoration-dotted hover:text-[#1b3624]">
            Torna alla homepage
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
