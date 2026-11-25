import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Domande frequenti su Radici Calabria: cos'è la piattaforma, come usarla, Pino, produttori e dati personali.",
  alternates: {
    canonical: `${getSiteUrl()}/faq`,
  },
};

const categorie = [
  {
    titolo: "La piattaforma",
    domande: [
      {
        domanda: "Che cos'è Radici Calabria?",
        risposta:
          "Radici Calabria è una piattaforma informativa e di connessione territoriale dedicata alle filiere agroalimentari e ai territori della Calabria. Presenta produttori, imprese, prodotti, stagionalità e iniziative del territorio.",
      },
      {
        domanda: "Radici Calabria vende i prodotti dei produttori?",
        risposta:
          "No. Radici Calabria non è parte di vendite o accordi tra utenti e produttori. Ogni rapporto diretto è concluso esclusivamente tra le parti.",
      },
      {
        domanda: "Come posso segnalare un contenuto inesatto?",
        risposta:
          "Puoi scrivere tramite la pagina Contatti indicando il contenuto e il motivo della segnalazione. Esaminiamo le segnalazioni e, se necessario, modifichiamo o rimuoviamo il contenuto.",
      },
    ],
  },
  {
    titolo: "Pino, l'assistente",
    domande: [
      {
        domanda: "Cos'è Pino?",
        risposta:
          "Pino è un sistema di intelligenza artificiale generativa basato su modelli linguistici (LLM) eseguiti tramite Groq. Risponde a partire dai contenuti del portale.",
      },
      {
        domanda: "Le risposte di Pino sono consulenza professionale?",
        risposta:
          "No. Le risposte di Pino non sostituiscono una consulenza professionale, medica, legale, fiscale o di sicurezza alimentare, e Pino non è un operatore umano. Verifica le informazioni presso i produttori o le fonti ufficiali.",
      },
    ],
  },
  {
    titolo: "Produttori e certificazioni",
    domande: [
      {
        domanda: "Le certificazioni DOP, IGP, PAT, De.Co. e Biologico sono verificate?",
        risposta:
          "Gli operatori aderenti garantiscono la veridicità delle certificazioni dichiarate sulle proprie schede. Radici Calabria non le certifica autonomamente, ma interviene quando riceve una segnalazione di non conformità.",
      },
      {
        domanda: "Come posso far inserire la mia impresa?",
        risposta:
          "Puoi contattarci tramite la pagina Contatti. Le regole per produttori e operatori sono descritte nella pagina Produttori e Filiere.",
      },
    ],
  },
  {
    titolo: "RadiciScan",
    domande: [
      {
        domanda: "Cos'è RadiciScan e che uso ne posso fare?",
        risposta:
          "RadiciScan è uno strumento digitale di esplorazione e supporto a titolo esclusivamente informativo e divulgativo, per conoscere prodotti e produzioni del territorio calabrese. Il suo utilizzo è libero e non comporta alcun obbligo.",
      },
      {
        domanda: "I risultati di RadiciScan certificano un prodotto?",
        risposta:
          "No. I risultati generati tramite Intelligenza Artificiale hanno carattere puramente orientativo: non costituiscono certificazione ufficiale (DOP, IGP, PAT, De.Co., Biologico), perizia tecnica, garanzia commerciale né parere sanitario, nutrizionale o sugli allergeni. Fa sempre fede l'etichetta fisica del prodotto e quanto dichiarato dal produttore.",
      },
    ],
  },
  {
    titolo: "Account e dati personali",
    domande: [
      {
        domanda: "Come posso creare un account?",
        risposta:
          "Puoi registrarti con email e password oppure, quando disponibile, con Google o Apple.",
      },
      {
        domanda: "Come vengono trattati i miei dati?",
        risposta:
          "I dati sono trattati secondo l'Informativa Privacy, che descrive dati trattati, finalità, fornitori, conservazione e diritti. I cookie e lo storage locale sono descritti nella Cookie Policy.",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <Header />

      <section className="bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950 text-white">
        <div className="mx-auto max-w-4xl px-5 py-14 text-center sm:px-8 md:py-18">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">
            Radici Calabria
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
            Domande frequenti
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
            Le risposte alle domande più comuni su piattaforma, assistente Pino, produttori e dati personali.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-14">
        <div className="space-y-10">
          {categorie.map((categoria) => (
            <section key={categoria.titolo}>
              <h2 className="mb-4 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                {categoria.titolo}
              </h2>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {categoria.domande.map((item, index) => (
                  <details
                    key={item.domanda}
                    className={index > 0 ? "border-t border-slate-200" : ""}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-sm font-bold text-slate-900 marker:hidden hover:bg-slate-50 sm:px-6 sm:py-5">
                      <span>{item.domanda}</span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-xl font-normal leading-none text-blue-700"
                      >
                        +
                      </span>
                    </summary>
                    <div className="px-5 pb-5 text-sm leading-6 text-slate-600 sm:px-6">
                      {item.risposta}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-black text-slate-900">Non hai trovato la risposta?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Consulta i Termini d&apos;Uso, la Privacy Policy o la Cookie Policy, oppure scrivici dalla
            pagina Contatti.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/contatti"
              className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-blue-900 transition hover:bg-yellow-300"
            >
              Contatti
            </Link>
            <Link
              href="/termini"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            >
              Termini d&apos;Uso
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            ← Torna a Radici Calabria
          </Link>
        </div>
      </div>
    </main>
  );
}
