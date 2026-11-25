import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Produttori e Filiere",
  description:
    "Regole per i produttori, le imprese e gli operatori che pubblicano le proprie schede su Radici Calabria.",
  alternates: {
    canonical: `${getSiteUrl()}/venditori`,
  },
};

const sezioni = [
  {
    titolo: "1. Natura della piattaforma",
    contenuto: (
      <>
        <p>
          Radici Calabria è una piattaforma informativa e di connessione territoriale. Mette in
          relazione produttori, imprese e filiere del territorio calabrese con i visitatori. Radici
          Calabria non è parte di alcuna vendita, accordo o rapporto commerciale tra utenti e
          produttori: ogni rapporto diretto è concluso esclusivamente tra le parti.
        </p>
      </>
    ),
  },
  {
    titolo: "2. Schede produttore e obblighi dell'operatore",
    contenuto: (
      <p>
        Ogni operatore che pubblica una scheda è responsabile della veridicità e dell'aggiornamento
        dei dati dichiarati: identità dell'impresa, localizzazione, prodotti, prezzi, disponibilità e
        informazioni sulla filiera.
      </p>
    ),
  },
  {
    titolo: "3. Denominazioni protette e certificazioni",
    contenuto: (
      <>
        <p>
          Le denominazioni di origine e le indicazioni geografiche protette, ai sensi del Regolamento
          (UE) 2024/1143, sono riservate a chi ne ha diritto. Per le denominazioni tutelate dal
          Regolamento UE 2024/1143 e per le certificazioni dichiarate (DOP, IGP, PAT, De.Co., Biologico),
          l'operatore garantisce che:
        </p>
        <ul>
          <li>il prodotto rientra effettivamente nella denominazione o certificazione indicata;</li>
          <li>la certificazione è in corso di validità e l'operatore può documentarla su richiesta;</li>
          <li>non sono utilizzati nomi, loghi o riferimenti che inducano in errore sull'origine.</li>
        </ul>
        <p>
          Le schede che indicano denominazioni o certificazioni non veritiere vengono rimosse o
          corrette.
        </p>
      </>
    ),
  },
  {
    titolo: "4. Obblighi di legge e responsabilità",
    contenuto: (
      <p>
        L'operatore è tenuto al rispetto della normativa applicabile alla propria attività (commercio,
        sicurezza alimentare, etichettatura, fiscalità, tutela dei consumatori). Radici Calabria non
        verifica preventivamente tutte le informazioni pubblicate e non garantisce la vendita, la
        consegna o la qualità dei prodotti.
      </p>
    ),
  },
  {
    titolo: "5. Contenuti generati con l'IA",
    contenuto: (
      <p>
        Alcune funzioni della piattaforma, come l'assistente Pino e gli strumenti di compilazione
        assistita, producono testi automaticamente. L'operatore è tenuto a verificarne il contenuto
        prima della pubblicazione. Pino è un sistema di intelligenza artificiale generativa e non è un
        operatore umano.
      </p>
    ),
  },
  {
    titolo: "6. Segnalazioni e rimozione dei contenuti",
    contenuto: (
      <p>
        Chiunque può segnalare contenuti inesatti o non conformi, inclusi quelli relativi a
        denominazioni e certificazioni, tramite la pagina{" "}
        <Link href="/contatti" className="font-semibold text-blue-700 underline">
          Contatti
        </Link>
        . Radici Calabria esamina la segnalazione e può modificare o rimuovere il contenuto, sospendere
        la scheda o chiedere documentazione all'operatore.
      </p>
    ),
  },
  {
    titolo: "7. Sospensione e recesso",
    contenuto: (
      <p>
        Radici Calabria può sospendere o rimuovere le schede che violano questi principi, previa
        comunicazione all'operatore quando possibile. L'operatore può chiedere la rimozione della
        propria scheda tramite la pagina Contatti.
      </p>
    ),
  },
  {
    titolo: "8. Contatti",
    contenuto: (
      <p>
        Per richieste su questi termini, sulla propria scheda o per segnalazioni, utilizza la pagina{" "}
        <Link href="/contatti" className="font-semibold text-blue-700 underline">
          Contatti
        </Link>
        .
      </p>
    ),
  },
];

export default function VenditoriPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
        <Link
          href="/"
          className="text-xs font-bold text-slate-500 transition hover:text-blue-600 hover:underline"
        >
          Torna alla home
        </Link>

        <article className="mt-5 overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-6 py-7 md:px-10 md:py-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              Produttori e Filiere
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-slate-900 md:text-4xl">
              Regole per produttori e operatori
            </h1>
          </header>

          <div className="space-y-8 px-6 py-7 text-[15px] leading-7 text-slate-700 md:px-10 md:py-9">
            <p>
              Progetto Radici Calabria — Piattaforma digitale di valorizzazione delle filiere
              agroalimentari e dei territori della Calabria · Castrovillari (CS).
            </p>
            {sezioni.map((sezione) => (
              <section key={sezione.titolo}>
                <h2 className="text-xl font-black tracking-tight text-slate-900">
                  {sezione.titolo}
                </h2>
                <div className="mt-3 space-y-3 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
                  {sezione.contenuto}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
