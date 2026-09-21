import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Informazioni sui cookie e sulle tecnologie analoghe utilizzate da InCittà.",
  alternates: {
    canonical: `${getSiteUrl()}/cookie`,
  },
};

const sezioni = [
  {
    titolo: "1. Cosa sono i cookie",
    contenuto: (
      <p>
        I cookie sono piccoli file o stringhe di informazioni che un sito può memorizzare sul
        dispositivo dell'utente. Possono essere utilizzate anche tecnologie analoghe per
        riconoscere una sessione, conservare preferenze o supportare il funzionamento dei
        servizi.
      </p>
    ),
  },
  {
    titolo: "2. Perché vengono utilizzati",
    contenuto: (
      <p>
        InCittà può utilizzare cookie e tecnologie analoghe per rendere disponibili le funzioni
        richieste, mantenere la sicurezza, gestire la sessione, ricordare preferenze e migliorare
        il funzionamento tecnico della piattaforma. Le categorie non necessarie vengono trattate
        secondo le regole e le scelte applicabili all'utente.
      </p>
    ),
  },
  {
    titolo: "3. Cookie tecnici e necessari",
    contenuto: (
      <p>
        Possono essere utilizzati strumenti tecnici necessari alla navigazione, alla sicurezza,
        alla gestione della sessione, all'accesso alle funzioni richieste e al corretto
        funzionamento della piattaforma. Questi strumenti possono essere indispensabili per
        fornire il servizio richiesto dall'utente.
      </p>
    ),
  },
  {
    titolo: "4. Cookie funzionali",
    contenuto: (
      <p>
        I cookie funzionali possono supportare preferenze o caratteristiche aggiuntive richieste
        dall'utente. Il loro utilizzo dipende dalle funzioni effettivamente disponibili e dalle
        configurazioni della piattaforma; non vengono indicati in questa pagina nomi o strumenti
        specifici non verificati.
      </p>
    ),
  },
  {
    titolo: "5. Cookie analitici",
    contenuto: (
      <p>
        I cookie analitici, quando presenti e attivati, possono essere utilizzati per comprendere
        in forma aggregata come vengono utilizzati i servizi e per migliorarne il funzionamento.
        Non si dichiara in questa pagina l'utilizzo effettivo di uno specifico strumento
        analitico non verificato nel progetto.
      </p>
    ),
  },
  {
    titolo: "6. Cookie di profilazione e marketing",
    contenuto: (
      <p>
        I cookie di profilazione o marketing possono essere utilizzati, quando previsti e
        autorizzati secondo la normativa applicabile, per finalità di personalizzazione o
        comunicazione promozionale. Non si dichiara l'attivazione di strumenti di questo tipo in
        assenza di una verifica tecnica specifica.
      </p>
    ),
  },
  {
    titolo: "7. Cookie di terze parti",
    contenuto: (
      <p>
        Alcuni servizi esterni collegati alla piattaforma possono utilizzare proprie tecnologie
        secondo le rispettive informative e configurazioni. InCittà non indica in questa pagina
        fornitori o cookie specifici che non siano stati verificati nel progetto.
      </p>
    ),
  },
  {
    titolo: "8. Tecnologie analoghe ai cookie",
    contenuto: (
      <p>
        La piattaforma può utilizzare tecnologie analoghe ai cookie, come strumenti tecnici per
        la gestione della sessione, della sicurezza o delle preferenze. Tali tecnologie sono
        considerate insieme ai cookie quando producono effetti analoghi sul dispositivo o sul
        browser dell'utente.
      </p>
    ),
  },
  {
    titolo: "9. Gestione delle preferenze",
    contenuto: (
      <p>
        Le preferenze relative alle tecnologie non necessarie possono essere gestite attraverso
        gli strumenti eventualmente resi disponibili dalla piattaforma. Se una funzione di
        gestione delle preferenze non è presente o non è disponibile in una determinata pagina,
        l'utente può utilizzare le impostazioni del proprio browser.
      </p>
    ),
  },
  {
    titolo: "10. Consenso e revoca del consenso",
    contenuto: (
      <p>
        Quando richiesto dalla normativa applicabile, le tecnologie non necessarie vengono
        utilizzate sulla base del consenso dell'utente. Il consenso può essere revocato secondo
        le modalità rese disponibili dalla piattaforma o tramite le impostazioni del browser,
        senza pregiudicare la liceità del trattamento basato sul consenso precedente alla revoca.
      </p>
    ),
  },
  {
    titolo: "11. Durata dei cookie",
    contenuto: (
      <p>
        La durata dei cookie può dipendere dalla loro funzione e dalla configurazione del
        servizio. Alcuni strumenti possono restare attivi solo per la sessione, mentre altri
        possono rimanere memorizzati per un periodo successivo. Non vengono indicati durate
        specifiche non verificate.
      </p>
    ),
  },
  {
    titolo: "12. Cookie utilizzati dalla piattaforma",
    contenuto: (
      <p>
        La piattaforma può utilizzare strumenti tecnici necessari al funzionamento delle pagine,
        alla sicurezza, alla gestione della sessione e alle funzioni richieste dall'utente. Un
        elenco dettagliato di nomi, finalità, durata e soggetti deve essere pubblicato o
        aggiornato sulla base dell'inventario tecnico effettivamente verificato.
      </p>
    ),
  },
  {
    titolo: "13. Servizi esterni",
    contenuto: (
      <p>
        I servizi esterni eventualmente utilizzati per funzioni tecniche o operative possono
        trattare informazioni secondo le proprie condizioni e informative. Per conoscere il
        dettaglio di uno specifico servizio occorre fare riferimento alla relativa documentazione
        resa disponibile dal servizio e dalla piattaforma.
      </p>
    ),
  },
  {
    titolo: "14. Come gestire i cookie dal browser",
    contenuto: (
      <p>
        L'utente può gestire, bloccare o eliminare i cookie tramite le impostazioni del proprio
        browser. Le modalità dipendono dal browser e dal dispositivo utilizzati; le istruzioni
        aggiornate sono disponibili nella documentazione del relativo produttore.
      </p>
    ),
  },
  {
    titolo: "15. Conseguenze della disabilitazione dei cookie",
    contenuto: (
      <p>
        La disabilitazione dei cookie tecnici o di tecnologie necessarie può impedire o
        compromettere alcune funzioni della piattaforma, della sessione, della sicurezza o del
        checkout. La disabilitazione di strumenti non necessari può invece incidere sulle relative
        funzioni, preferenze o misurazioni.
      </p>
    ),
  },
  {
    titolo: "16. Modifiche alla Cookie Policy",
    contenuto: (
      <p>
        Questa Cookie Policy può essere aggiornata in caso di modifiche tecniche, organizzative,
        normative o dei servizi utilizzati. La versione pubblicata indica, quando previsto, la
        data di aggiornamento o di entrata in vigore.
      </p>
    ),
  },
  {
    titolo: "17. Contatti",
    contenuto: (
      <p>
        Per informazioni sui cookie e sulle tecnologie analoghe è possibile utilizzare i canali
        di contatto indicati nella sezione contatti della piattaforma o nella Privacy Policy. Non
        vengono inseriti in questa pagina recapiti non verificati.
      </p>
    ),
  },
];

export default function CookiePolicyPage() {
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
              Cookie Policy
            </h1>
          </header>

          <div className="space-y-8 px-6 py-7 text-[15px] leading-7 text-slate-700 md:px-10 md:py-9">
            <p>
              Questa Cookie Policy integra la Privacy Policy di InCittà per quanto riguarda i
              cookie e le tecnologie analoghe utilizzate in relazione alla piattaforma.
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
