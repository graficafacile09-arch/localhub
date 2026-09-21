import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Termini per gli Acquirenti",
  description: "Termini per gli Acquirenti che utilizzano la piattaforma InCittà.",
  alternates: {
    canonical: `${getSiteUrl()}/acquirenti`,
  },
};

const sezioni = [
  {
    titolo: "1. Oggetto",
    contenuto: (
      <p>
        I presenti Termini descrivono le regole di utilizzo della piattaforma InCittà da parte
        degli Acquirenti. La piattaforma consente di consultare offerte e di utilizzare
        strumenti tecnici per avviare e seguire ordini relativi a prodotti, servizi o altre
        prestazioni proposte dai Venditori.
      </p>
    ),
  },
  {
    titolo: "2. Ruolo di InCittà",
    contenuto: (
      <>
        <p>
          InCittà è una piattaforma e un'infrastruttura tecnologica che mette a disposizione
          strumenti di marketplace, consultazione delle offerte, checkout, gestione tecnica
          degli ordini, comunicazioni e strumenti tecnici per reclami e segnalazioni.
        </p>
        <p>
          Le funzioni tecniche della piattaforma non fanno apparire InCittà come il venditore
          dei prodotti o dei servizi pubblicati dai Venditori. Restano fermi gli obblighi
          eventualmente attribuiti direttamente a InCittà dalla normativa applicabile.
        </p>
      </>
    ),
  },
  {
    titolo: "3. Ruolo dell'Acquirente",
    contenuto: (
      <p>
        L'Acquirente utilizza la piattaforma per consultare le offerte, fornire i dati
        necessari, inviare ordini e comunicare con il Venditore attraverso i canali disponibili.
        Prima dell'acquisto deve verificare le informazioni dell'offerta, del Venditore e delle
        condizioni applicabili alla specifica vendita.
      </p>
    ),
  },
  {
    titolo: "4. Account e accesso alla piattaforma",
    contenuto: (
      <p>
        Alcune funzioni possono richiedere un account e altre possono essere disponibili senza
        registrazione. L'Acquirente deve utilizzare l'account secondo le istruzioni della
        piattaforma e mantenere aggiornati i dati necessari per le funzioni utilizzate.
      </p>
    ),
  },
  {
    titolo: "5. Acquisto come ospite",
    contenuto: (
      <p>
        Quando il flusso lo consente, l'Acquirente può utilizzare il checkout senza creare un
        account. Anche in questo caso deve fornire dati corretti e un recapito idoneo a ricevere
        le comunicazioni relative all'ordine e al pagamento.
      </p>
    ),
  },
  {
    titolo: "6. Correttezza dei dati forniti",
    contenuto: (
      <p>
        I dati forniti dall'Acquirente devono essere accurati, completi e aggiornati per quanto
        necessario al checkout, all'ordine, al pagamento, alla consegna, al ritiro o alla
        prestazione. Eventuali dati errati possono impedire al Venditore o ai provider coinvolti
        di gestire correttamente il flusso.
      </p>
    ),
  },
  {
    titolo: "7. Sicurezza dell'account",
    contenuto: (
      <p>
        L'Acquirente deve proteggere le proprie credenziali e segnalare tempestivamente accessi
        non autorizzati o utilizzi sospetti. Non deve condividere credenziali o utilizzare
        account altrui senza autorizzazione.
      </p>
    ),
  },
  {
    titolo: "8. Utilizzo della piattaforma",
    contenuto: (
      <p>
        La piattaforma deve essere utilizzata in modo lecito, corretto e coerente con la sua
        funzione. Non è consentito aggirare i controlli, compromettere la sicurezza, introdurre
        codice o contenuti dannosi, manipolare ordini o pagamenti o usare i servizi per attività
        fraudolente o non autorizzate.
      </p>
    ),
  },
  {
    titolo: "9. Consultazione delle offerte",
    contenuto: (
      <>
        <p>
          Le offerte sono pubblicate dai Venditori tramite gli strumenti messi a disposizione
          dalla piattaforma. L'Acquirente deve leggere le informazioni disponibili su prodotto,
          servizio, prezzo, disponibilità, modalità di esecuzione e Venditore prima di inviare
          un ordine.
        </p>
        <p>
          InCittà può eseguire controlli tecnici e aggiornare la presentazione delle offerte,
          senza sostituire le informazioni e le responsabilità commerciali del Venditore.
        </p>
      </>
    ),
  },
  {
    titolo: "10. Invio dell'ordine",
    contenuto: (
      <p>
        Il checkout raccoglie i dati necessari e li trasmette secondo il flusso applicabile.
        Prima dell'invio l'Acquirente deve controllare riepilogo, Venditore, prodotti o servizi,
        quantità, importi, modalità di consegna o ritiro e metodo di pagamento. L'invio può
        essere seguito da verifiche tecniche e dalla conferma prevista dal flusso.
      </p>
    ),
  },
  {
    titolo: "11. Rapporto tra Acquirente e Venditore",
    contenuto: (
      <>
        <p>
          Il rapporto commerciale relativo alla vendita o alla prestazione nasce tra
          Acquirente e Venditore secondo le condizioni applicabili alla specifica offerta.
          Il Venditore determina l'offerta, i prezzi, la disponibilità e le condizioni
          commerciali nei limiti della piattaforma e della normativa applicabile.
        </p>
        <p>
          Il Venditore gestisce l'esecuzione della vendita o della prestazione, la consegna o
          il ritiro quando applicabile, la documentazione fiscale, l'assistenza commerciale,
          nonché le richieste relative a recesso, resi, rimborsi, garanzia e conformità secondo
          le condizioni applicabili e la normativa vigente.
        </p>
      </>
    ),
  },
  {
    titolo: "12. Pagamenti e autorizzazione del pagamento",
    contenuto: (
      <>
        <p>
          Il pagamento elettronico è avviato tramite il provider e il metodo mostrati nel
          checkout. Il flusso attualmente integrato utilizza Stripe e, quando previsto, Stripe
          Connect sui relativi account collegati del Venditore. Il catalogo può comprendere
          carta, Klarna, PayPal, SEPA Direct Debit e bonifico istantaneo, soltanto quando il
          metodo è disponibile per il negozio interessato.
        </p>
        <p>
          Klarna, PayPal, SEPA Direct Debit e bonifico istantaneo sono esposti tramite
          l'integrazione Stripe; il bonifico istantaneo non è un bonifico bancario ordinario
          diretto al Venditore. Il provider gestisce tecnicamente autorizzazione, eventuale
          finanziamento o altre operazioni relative al metodo secondo le proprie condizioni.
        </p>
        <p>
          InCittà può trasmettere al provider i dati necessari e aggiornare tecnicamente lo
          stato del checkout o dell'ordine sulla base delle informazioni ricevute. Il ruolo
          tecnico di InCittà non la rende il Venditore del prodotto o del servizio. Eventuali
          commissioni della piattaforma sono distinte dal prezzo della vendita secondo la
          configurazione applicabile e gli accordi con il Venditore.
        </p>
      </>
    ),
  },
  {
    titolo: "13. Conferma dell'ordine",
    contenuto: (
      <p>
        L'Acquirente riceve le comunicazioni previste dal flusso quando l'ordine o l'intento di
        checkout viene registrato e quando il pagamento raggiunge lo stato necessario. La
        conferma tecnica non sostituisce le condizioni della specifica vendita né gli eventuali
        passaggi che spettano al Venditore.
      </p>
    ),
  },
  {
    titolo: "14. Consegna, ritiro o prestazione del servizio",
    contenuto: (
      <p>
        Il Venditore cura la consegna, il ritiro o l'esecuzione della prestazione secondo quanto
        indicato nell'offerta e nell'ordine. Tempi, modalità, disponibilità e impedimenti
        devono essere verificati con il Venditore, salvo le comunicazioni tecniche che InCittà
        può trasmettere attraverso la piattaforma.
      </p>
    ),
  },
  {
    titolo: "15. Comunicazioni relative all'ordine",
    contenuto: (
      <p>
        InCittà può inviare comunicazioni tecniche sulla ricezione, sul pagamento e sullo stato
        dell'ordine. Il Venditore può inviare comunicazioni operative o commerciali relative
        all'offerta e alla sua esecuzione. L'Acquirente deve controllare i recapiti forniti e i
        messaggi ricevuti nei canali indicati.
      </p>
    ),
  },
  {
    titolo: "16. Reclami e comunicazioni con il Venditore",
    contenuto: (
      <>
        <p>
          InCittà può mettere a disposizione strumenti tecnici per aprire un reclamo, conservare
          le comunicazioni e consentire lo scambio di messaggi con il Venditore.
        </p>
        <p>
          Il Venditore è il referente commerciale per le questioni relative al prodotto,
          servizio o prestazione. L'Acquirente deve utilizzare i canali disponibili per
          descrivere la richiesta e fornire le informazioni utili alla sua gestione.
        </p>
      </>
    ),
  },
  {
    titolo: "17. Recesso, resi e rimborsi",
    contenuto: (
      <p>
        Recesso, resi e rimborsi sono disciplinati dalle relative Condizioni di vendita, dalle
        informazioni dell'offerta e dalla normativa applicabile. Le richieste commerciali
        devono essere rivolte al Venditore secondo i canali indicati. InCittà può eseguire
        tecnicamente operazioni di rimborso tramite il provider quando previsto dal workflow e
        dopo le autorizzazioni necessarie, senza sostituire la decisione commerciale del
        soggetto competente.
      </p>
    ),
  },
  {
    titolo: "18. Garanzia e conformità",
    contenuto: (
      <p>
        Garanzia, conformità e rimedi relativi al prodotto, servizio o prestazione sono
        disciplinati dalle relative Condizioni di vendita, dalle informazioni dell'offerta e
        dalla normativa applicabile. L'Acquirente deve rivolgersi al Venditore per la gestione
        commerciale della richiesta, fatti salvi gli obblighi direttamente applicabili a
        InCittà.
      </p>
    ),
  },
  {
    titolo: "19. Comportamenti vietati",
    contenuto: (
      <p>
        Non è consentito utilizzare la piattaforma per attività illecite o fraudolente,
        fornire dati falsi, aprire account multipli per aggirare limitazioni, manipolare ordini
        o pagamenti, abusare dei reclami, violare i diritti di terzi o compromettere la sicurezza
        e il corretto funzionamento dei servizi.
      </p>
    ),
  },
  {
    titolo: "20. Frodi, abusi e contestazioni di pagamento",
    contenuto: (
      <p>
        In presenza di attività sospette, frodi, utilizzi abusivi o contestazioni di pagamento,
        InCittà può effettuare verifiche tecniche, coinvolgere il provider e adottare le misure
        previste dai propri flussi e dalla normativa applicabile. L'Acquirente deve collaborare
        alle verifiche richieste e utilizzare i canali appropriati per eventuali contestazioni.
      </p>
    ),
  },
  {
    titolo: "21. Recensioni e contenuti dell'Acquirente",
    contenuto: (
      <p>
        Quando la piattaforma consente di pubblicare recensioni o altri contenuti, l'Acquirente
        deve utilizzare informazioni pertinenti, corrette e lecite e deve disporre dei diritti
        necessari sui materiali condivisi. InCittà può applicare controlli tecnici o limitare
        contenuti nei casi previsti dalle regole della piattaforma o dalla normativa applicabile.
      </p>
    ),
  },
  {
    titolo: "22. Sospensione o limitazione dell'accesso",
    contenuto: (
      <p>
        L'accesso a funzioni o account può essere limitato o sospeso quando ciò sia
        ragionevolmente necessario per sicurezza, violazioni delle regole, attività fraudolente,
        dati non corretti, richieste delle autorità o altri presupposti previsti dagli accordi
        applicabili o dalla normativa. Le misure devono essere applicate nel rispetto dei diritti
        spettanti all'Acquirente.
      </p>
    ),
  },
  {
    titolo: "23. Privacy e Cookie Policy",
    contenuto: (
      <p>
        Il trattamento dei dati personali e l'uso di cookie e strumenti di tracciamento sono
        descritti nella Privacy Policy e nella Cookie Policy applicabili. I presenti Termini non
        sostituiscono tali documenti né eventuali consensi o preferenze separati richiesti dalla
        normativa.
      </p>
    ),
  },
  {
    titolo: "24. Modifiche ai presenti Termini",
    contenuto: (
      <p>
        I presenti Termini possono essere aggiornati per esigenze tecniche, organizzative,
        normative o di servizio. La versione pubblicata indicherà, quando previsto, la data di
        decorrenza e le modalità di comunicazione delle modifiche. Gli effetti sui rapporti già
        in corso e sugli ordini già inviati devono essere valutati secondo la normativa
        applicabile.
      </p>
    ),
  },
  {
    titolo: "25. Legge applicabile e foro",
    contenuto: (
      <p>
        La legge applicabile e l'eventuale foro competente saranno determinati nel rispetto delle
        norme inderogabili applicabili agli Acquirenti e degli eventuali diritti riconosciuti
        dalla normativa vigente.
      </p>
    ),
  },
];

export default function TerminiAcquirentiPage() {
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
              Documentazione per gli Acquirenti
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-slate-900 md:text-4xl">
              Termini per gli Acquirenti
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
