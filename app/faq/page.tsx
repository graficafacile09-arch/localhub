import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Domande frequenti su InCittà, acquisti, ordini, pagamenti, venditori e utilizzo della piattaforma.",
  alternates: {
    canonical: `${getSiteUrl()}/faq`,
  },
};

const categorie = [
  {
    titolo: "InCittà",
    domande: [
      {
        domanda: "Che cos'è InCittà?",
        risposta:
          "InCittà è una piattaforma digitale dedicata al commercio e ai servizi locali. Permette di cercare negozi, prodotti, professionisti, offerte e servizi della propria città e, quando il Venditore lo rende disponibile, di effettuare ordini tramite il checkout della piattaforma.",
      },
      {
        domanda: "InCittà è il venditore dei prodotti che trovo sul sito?",
        risposta:
          "No. I prodotti, i servizi e le altre prestazioni sono proposti dai singoli Venditori. Il rapporto commerciale relativo all'acquisto o alla prestazione è tra Acquirente e Venditore. InCittà mette a disposizione l'infrastruttura tecnologica e gli strumenti digitali della piattaforma, fermo restando quanto previsto dalla normativa applicabile.",
      },
      {
        domanda: "Posso usare InCittà anche senza registrarmi?",
        risposta:
          "Alcune funzioni possono essere utilizzate senza account. Quando il checkout lo consente, è possibile effettuare un acquisto come ospite fornendo i dati necessari per l'ordine, il pagamento e le comunicazioni.",
      },
    ],
  },
  {
    titolo: "Ricerca, negozi e offerte",
    domande: [
      {
        domanda: "Come trovo un negozio o un prodotto?",
        risposta:
          "Puoi usare la ricerca nella homepage oppure navigare nelle sezioni Negozi, Offerte e Categorie. Le schede pubblicate mostrano le informazioni rese disponibili dai singoli Venditori.",
      },
      {
        domanda: "Le informazioni sui prodotti e sui prezzi sono sempre aggiornate?",
        risposta:
          "Le informazioni delle offerte sono gestite dai Venditori. Prima di concludere un ordine è importante verificare prodotto o servizio, prezzo, disponibilità, modalità di consegna o ritiro e le condizioni indicate nella specifica offerta.",
      },
      {
        domanda: "Posso contattare il Venditore per un ordine?",
        risposta:
          "Sì, quando sono disponibili sulla piattaforma i relativi strumenti di comunicazione o i recapiti del Venditore. Per informazioni sull'esecuzione della vendita, sulla consegna, sul ritiro, sui prodotti o sui servizi, il riferimento commerciale è il Venditore.",
      },
    ],
  },
  {
    titolo: "Ordini e pagamenti",
    domande: [
      {
        domanda: "Come faccio un ordine?",
        risposta:
          "Seleziona il prodotto o servizio, aggiungilo al carrello quando previsto, controlla il riepilogo e inserisci i dati richiesti. Prima dell'invio verifica sempre Venditore, articoli o servizi, quantità, importi, modalità di consegna o ritiro e metodo di pagamento.",
      },
      {
        domanda: "Quali metodi di pagamento posso utilizzare?",
        risposta:
          "I metodi disponibili dipendono dal negozio e dalla configurazione del checkout. InCittà può offrire, quando disponibili, carta, Klarna, Scalapay, PayPal e SEPA Direct Debit; alcuni flussi possono prevedere anche il bonifico istantaneo. Il metodo effettivamente utilizzabile è quello mostrato nel checkout per quello specifico ordine.",
      },
      {
        domanda: "InCittà riceve direttamente i dati della mia carta?",
        risposta:
          "Il pagamento elettronico viene gestito tramite i provider di pagamento integrati nella piattaforma. InCittà può ricevere dal provider le informazioni tecniche necessarie per aggiornare lo stato del pagamento e dell'ordine, secondo il flusso utilizzato.",
      },
      {
        domanda: "Perché un metodo di pagamento può non comparire?",
        risposta:
          "La disponibilità di un metodo dipende dal negozio, dall'importo, dalla configurazione del pagamento e dalle condizioni del relativo provider. Per questo il checkout può mostrare metodi diversi per ordini diversi.",
      },
      {
        domanda: "Dove trovo le condizioni relative a un acquisto?",
        risposta:
          "Le condizioni applicabili devono essere lette insieme alle informazioni dell'offerta e del Venditore. Sul sito sono disponibili anche le Condizioni di vendita e i Termini per gli Acquirenti.",
      },
    ],
  },
  {
    titolo: "Consegna, ritiro e assistenza",
    domande: [
      {
        domanda: "Chi gestisce la consegna o il ritiro?",
        risposta:
          "Le modalità di consegna, ritiro o esecuzione del servizio dipendono dalla specifica offerta e dal Venditore. Il Venditore gestisce l'esecuzione della vendita o della prestazione secondo le condizioni applicabili.",
      },
      {
        domanda: "Cosa faccio se il mio ordine ha un problema?",
        risposta:
          "Controlla innanzitutto le informazioni e le comunicazioni relative all'ordine. Per problemi relativi al prodotto, al servizio, alla consegna, al ritiro, a un reso, a un rimborso o alla conformità dell'acquisto, puoi utilizzare i canali disponibili sulla piattaforma e contattare il Venditore. InCittà può fornire supporto tecnico sui servizi della piattaforma.",
      },
      {
        domanda: "Come funzionano resi, rimborsi e recesso?",
        risposta:
          "Le regole applicabili dipendono dal tipo di acquisto, dal Venditore e dalla normativa vigente. Le richieste relative alla vendita, compresi recesso, resi, rimborsi e garanzia, devono essere gestite secondo le condizioni applicabili alla specifica vendita e con il Venditore, fatti salvi i diritti inderogabili previsti dalla legge.",
      },
    ],
  },
  {
    titolo: "Account e sicurezza",
    domande: [
      {
        domanda: "Come posso creare un account?",
        risposta:
          "Puoi registrarti attraverso il flusso di autenticazione disponibile sul sito. InCittà supporta la registrazione con email e password e può offrire autenticazione tramite Google e altri provider quando disponibili.",
      },
      {
        domanda: "Posso acquistare senza creare un account?",
        risposta:
          "Sì, quando il checkout del negozio lo consente. L'acquisto come ospite richiede comunque i dati necessari per gestire correttamente ordine, pagamento e comunicazioni.",
      },
      {
        domanda: "Cosa devo fare se sospetto un accesso non autorizzato?",
        risposta:
          "Proteggi immediatamente il tuo account, modifica la password se utilizzi l'accesso con email e password e segnala il problema attraverso i canali di assistenza disponibili. Non condividere mai le tue credenziali con altre persone.",
      },
    ],
  },
  {
    titolo: "Per i Venditori",
    domande: [
      {
        domanda: "Come posso aprire un negozio su InCittà?",
        risposta:
          "Dalla piattaforma puoi accedere all'area Venditore e seguire il percorso di registrazione e attivazione previsto. L'accesso alle funzioni operative può dipendere dal completamento delle informazioni e delle verifiche richieste.",
      },
      {
        domanda: "Chi è responsabile dei prodotti e dei servizi pubblicati?",
        risposta:
          "Il Venditore è responsabile delle proprie offerte, dei dati identificativi, dei prezzi, della disponibilità, delle caratteristiche e degli obblighi commerciali relativi a ciò che propone, secondo la normativa applicabile.",
      },
      {
        domanda: "Chi gestisce gli ordini ricevuti?",
        risposta:
          "Il Venditore gestisce l'esecuzione dei propri ordini e delle proprie prestazioni, compresi gli aspetti operativi come preparazione, consegna, ritiro o erogazione del servizio quando applicabili. InCittà fornisce gli strumenti tecnici della piattaforma.",
      },
    ],
  },
  {
    titolo: "Privacy e dati",
    domande: [
      {
        domanda: "Come vengono trattati i miei dati?",
        risposta:
          "Il trattamento dei dati dipende dai servizi utilizzati e dalle operazioni effettuate sulla piattaforma. Per i dettagli su dati trattati, finalità, basi giuridiche, conservazione e diritti dell'interessato puoi consultare l'Informativa Privacy.",
      },
      {
        domanda: "Dove posso leggere le policy del sito?",
        risposta:
          "Nel footer trovi i collegamenti a Privacy, Cookie Policy, Termini e condizioni, Termini per gli Acquirenti, Condizioni di vendita e Termini per i Venditori. La FAQ è un riepilogo pratico e non sostituisce questi documenti.",
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
            InCittà
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
            Domande frequenti
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
            Le risposte alle domande più comuni su ricerca, acquisti, ordini,
            pagamenti, venditori e utilizzo della piattaforma.
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
            Per le condizioni giuridiche e commerciali complete consulta i documenti
            pubblicati nel footer. Per un problema relativo a uno specifico ordine,
            verifica prima le informazioni del Venditore e dell'ordine.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/acquirenti"
              className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-blue-900 transition hover:bg-yellow-300"
            >
              Termini per gli Acquirenti
            </Link>
            <Link
              href="/condizioni-vendita"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            >
              Condizioni di vendita
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            ← Torna a InCittà
          </Link>
        </div>
      </div>
    </main>
  );
}
