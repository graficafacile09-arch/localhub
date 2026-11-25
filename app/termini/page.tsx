import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Termini d'Uso",
  description:
    "Termini d'uso della piattaforma informativa e di connessione territoriale Radici Calabria.",
  alternates: {
    canonical: `${getSiteUrl()}/termini`,
  },
};

const sezioni = [
  {
    titolo: "1. Oggetto e natura della piattaforma",
    contenuto: (
      <p>
        Radici Calabria è una piattaforma informativa e di connessione territoriale dedicata alle
        filiere agroalimentari e ai territori della Calabria. Presenta produttori, imprese,
        prodotti, stagionalità e iniziative del territorio. Radici Calabria non è parte di vendite,
        accordi o rapporti commerciali tra utenti e produttori, che restano conclusi direttamente tra
        le parti.
      </p>
    ),
  },
  {
    titolo: "2. Titolare e contatti",
    contenuto: (
      <p>
        Il servizio è gestito dal Progetto Radici Calabria — Piattaforma digitale di valorizzazione
        delle filiere agroalimentari e dei territori della Calabria · Castrovillari (CS). Per
        informazioni, richieste e segnalazioni utilizza la pagina{" "}
        <Link href="/contatti" className="font-semibold text-blue-700 underline">
          Contatti
        </Link>
        .
      </p>
    ),
  },
  {
    titolo: "3. Uso della piattaforma",
    contenuto: (
      <p>
        L'utente si impegna a utilizzare il sito in modo lecito, senza danneggiarne il funzionamento,
        senza tentare accessi non autorizzati e senza pubblicare contenuti falsi, offensivi o
        illeciti.
      </p>
    ),
  },
  {
    titolo: "4. Produttori, imprese e denominazioni protette",
    contenuto: (
      <p>
        Le schede dei produttori sono pubblicate sotto la responsabilità dei rispettivi operatori.
        Gli operatori aderenti garantiscono la veridicità delle certificazioni dichiarate sulle proprie
        schede, incluse le denominazioni DOP e IGP tutelate dal Regolamento (UE) 2024/1143, le
        denominazioni PAT e De.Co. e la certificazione Biologico. Radici Calabria non certifica
        autonomamente tali dichiarazioni e ne segnala la non conformità quando riceve una
        segnalazione. Le regole per gli operatori sono descritte nella pagina{" "}
        <Link href="/venditori" className="font-semibold text-blue-700 underline">
          Produttori e Filiere
        </Link>
        .
      </p>
    ),
  },
  {
    titolo: "5. Assistente Pino e intelligenza artificiale",
    contenuto: (
      <>
        <p>
          Pino è un sistema di intelligenza artificiale generativa basato su modelli linguistici (LLM)
          eseguiti tramite Groq. Pino elabora risposte automatiche a partire dai contenuti pubblicati
          sul portale. Le risposte di Pino non sostituiscono una consulenza professionale, medica,
          legale, fiscale o di sicurezza alimentare, e Pino non è un operatore umano.
        </p>
        <p>
          Le informazioni fornite da Pino possono contenere errori: verificale presso i produttori o
          le fonti ufficiali prima di prendere decisioni.
        </p>
      </>
    ),
  },
  {
    titolo: "6. Contenuti pubblicati e segnalazioni",
    contenuto: (
      <p>
        Chiunque rilevi contenuti inesatti o non conformi, incluse denominazioni o certificazioni non
        veritiere, può segnalarli tramite la pagina{" "}
        <Link href="/contatti" className="font-semibold text-blue-700 underline">
          Contatti
        </Link>
        , indicando il contenuto e il motivo della segnalazione. Radici Calabria esamina le segnalazioni
        e, se necessario, modifica o rimuove i contenuti.
      </p>
    ),
  },
  {
    titolo: "7. Limitazione di responsabilità",
    contenuto: (
      <p>
        Radici Calabria non risponde della qualità, della disponibilità, della consegna o della
        conformità dei prodotti dei produttori, né delle obbligazioni assunte tra utenti e
        produttori. Il sito è fornito nello stato in cui si trova, senza garanzie di continuità
        assoluta.
      </p>
    ),
  },
  {
    titolo: "8. Proprietà intellettuale",
    contenuto: (
      <p>
        I contenuti del sito, inclusi marchi, testi e grafiche della piattaforma, sono protetti dalla
        normativa applicabile. I contenuti delle schede restano di proprietà dei rispettivi operatori.
      </p>
    ),
  },
  {
    titolo: "9. Dati personali e cookie",
    contenuto: (
      <p>
        Il trattamento dei dati personali è descritto nella{" "}
        <Link href="/privacy" className="font-semibold text-blue-700 underline">
          Informativa Privacy
        </Link>
        . L'uso dei cookie e delle tecnologie di archiviazione locale è descritto nella{" "}
        <Link href="/cookie" className="font-semibold text-blue-700 underline">
          Cookie Policy
        </Link>
        .
      </p>
    ),
  },
  {
    titolo: "10. RadiciScan",
    contenuto: (
      <>
        <p>
          RadiciScan è uno strumento digitale di esplorazione e supporto a titolo esclusivamente
          informativo e divulgativo, per conoscere prodotti e produzioni del territorio calabrese.
          Il suo utilizzo è libero e non comporta alcun obbligo per l'utente.
        </p>
        <p>
          I risultati generati tramite Intelligenza Artificiale (Regolamento UE 2024/1689, AI Act)
          hanno carattere puramente orientativo. Non costituiscono certificazione ufficiale (DOP,
          IGP, PAT, De.Co., Biologico), perizia tecnica, garanzia commerciale né parere sanitario,
          nutrizionale o sugli allergeni. Fa sempre fede l'etichetta fisica del prodotto e quanto
          dichiarato dal produttore.
        </p>
        <p>
          L'analisi di immagini ed etichette è elaborata con modelli di intelligenza artificiale di
          fornitori terzi e può consultare fonti web pubbliche per confrontare le informazioni.
        </p>
      </>
    ),
  },
  {
    titolo: "11. Legge applicabile e modifiche",
    contenuto: (
      <p>
        I presenti termini sono regolati dalla legge italiana. Radici Calabria può aggiornarli in
        qualsiasi momento; la versione pubblicata è quella in vigore.
      </p>
    ),
  },
];

export default function TerminiPage() {
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
              Documentazione della piattaforma
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-slate-900 md:text-4xl">
              Termini d&apos;Uso
            </h1>
          </header>

          <div className="space-y-8 px-6 py-7 text-[15px] leading-7 text-slate-700 md:px-10 md:py-9">
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
