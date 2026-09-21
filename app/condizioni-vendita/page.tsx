import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Condizioni di vendita",
  description: "Condizioni di vendita per gli ordini effettuati tramite InCittà.",
  alternates: {
    canonical: `${getSiteUrl()}/condizioni-vendita`,
  },
};

const sezioni = [
  {
    titolo: "1. Oggetto delle Condizioni di vendita",
    contenuto: (
      <p>
        Le presenti Condizioni descrivono le regole generali applicabili alle vendite di
        prodotti, servizi o altre prestazioni offerte dai Venditori tramite InCittà. Le
        condizioni specifiche dell'offerta, dell'ordine e del Venditore integrano questo
        documento quando rese disponibili all'Acquirente.
      </p>
    ),
  },
  {
    titolo: "2. Ruolo di InCittà",
    contenuto: (
      <p>
        InCittà mette a disposizione una piattaforma e un'infrastruttura tecnologica per la
        pubblicazione delle offerte, il checkout, la gestione tecnica degli ordini, le
        comunicazioni e gli strumenti tecnici collegati al pagamento. InCittà non è presentata
        come il Venditore dei prodotti o servizi pubblicati sulla piattaforma, fatti salvi gli
        obblighi direttamente applicabili secondo la normativa vigente.
      </p>
    ),
  },
  {
    titolo: "3. Identificazione del Venditore",
    contenuto: (
      <p>
        Il Venditore è identificato nelle informazioni dell'offerta e dell'ordine con i dati
        disponibili per la specifica vendita, tra cui denominazione o nome, eventuale
        denominazione commerciale, partita IVA o codice fiscale quando previsto, sede, recapiti
        e contatti. Le informazioni identificative associate all'ordine costituiscono il
        riferimento per ricostruire il rapporto commerciale relativo a quell'ordine.
      </p>
    ),
  },
  {
    titolo: "4. Rapporto contrattuale tra Acquirente e Venditore",
    contenuto: (
      <p>
        Il rapporto commerciale relativo alla vendita o alla prestazione nasce tra Acquirente e
        Venditore secondo l'offerta, l'ordine e le condizioni applicabili. Il Venditore è il
        soggetto che offre il prodotto o servizio e che gestisce gli aspetti commerciali della
        relativa esecuzione.
      </p>
    ),
  },
  {
    titolo: "5. Prodotti e servizi offerti",
    contenuto: (
      <p>
        I prodotti, servizi e altre prestazioni sono descritti dal Venditore. Il Venditore cura
        le caratteristiche, le modalità di esecuzione, le eventuali limitazioni e le
        informazioni necessarie per consentire all'Acquirente una scelta consapevole.
      </p>
    ),
  },
  {
    titolo: "6. Informazioni sull'offerta",
    contenuto: (
      <p>
        L'Acquirente deve verificare prima dell'ordine le informazioni pubblicate, inclusi il
        Venditore, il prodotto o servizio, il prezzo, la disponibilità, le modalità di consegna,
        ritiro o prestazione e le condizioni rese disponibili. Il Venditore deve mantenere tali
        informazioni accurate e aggiornate.
      </p>
    ),
  },
  {
    titolo: "7. Prezzi",
    contenuto: (
      <p>
        I prezzi e gli eventuali costi applicabili sono quelli mostrati nell'offerta e nel
        riepilogo dell'ordine, salvo errori manifesti o specifiche condizioni comunicate prima
        dell'invio. Il Venditore determina i prezzi delle proprie offerte nei limiti della
        piattaforma e della normativa applicabile.
      </p>
    ),
  },
  {
    titolo: "8. Imposte e documentazione fiscale",
    contenuto: (
      <p>
        Il Venditore cura la documentazione fiscale, le ricevute, la fatturazione e gli altri
        adempimenti connessi alla vendita o alla prestazione nei casi e nei modi previsti dalla
        normativa applicabile. Eventuali dati o strumenti tecnici forniti dalla piattaforma non
        sostituiscono la valutazione degli obblighi del Venditore.
      </p>
    ),
  },
  {
    titolo: "9. Disponibilità",
    contenuto: (
      <p>
        La disponibilità dei prodotti, servizi o prestazioni è gestita dal Venditore. Le
        informazioni visualizzate possono essere soggette a verifiche tecniche e devono essere
        aggiornate dal Venditore quando cambiano. L'ordine resta soggetto alle verifiche
        previste dal flusso applicabile.
      </p>
    ),
  },
  {
    titolo: "10. Invio dell'ordine",
    contenuto: (
      <p>
        L'Acquirente seleziona l'offerta, verifica le informazioni disponibili e invia l'ordine
        tramite il checkout. Il sistema raccoglie i dati necessari e può eseguire verifiche
        tecniche prima di trasmettere la richiesta al Venditore secondo il flusso applicabile.
      </p>
    ),
  },
  {
    titolo: "11. Conclusione del contratto",
    contenuto: (
      <p>
        La conclusione della vendita o del rapporto relativo alla prestazione è regolata dalle
        condizioni applicabili alla specifica offerta e dal rapporto tra Acquirente e Venditore.
        La registrazione o conferma tecnica sulla piattaforma non descrive InCittà come parte
        venditrice.
      </p>
    ),
  },
  {
    titolo: "12. Conferma dell'ordine",
    contenuto: (
      <p>
        L'Acquirente riceve le comunicazioni previste dal flusso quando l'ordine viene registrato
        o quando il pagamento raggiunge lo stato necessario. La conferma indica, per quanto
        applicabile, il Venditore, gli articoli o servizi, gli importi e le modalità di esecuzione.
      </p>
    ),
  },
  {
    titolo: "13. Pagamenti",
    contenuto: (
      <p>
        Il pagamento elettronico può essere gestito tramite Stripe e, quando previsto dalla
        configurazione, tramite Stripe Connect sui relativi account collegati del Venditore,
        secondo il metodo mostrato nel checkout. Il catalogo tecnico può comprendere carta,
        Klarna, PayPal, SEPA Direct Debit e bonifico istantaneo quando disponibili per il
        negozio interessato. InCittà fornisce l'infrastruttura tecnica del processo e non è il
        Venditore né il creditore del prezzo della vendita.
      </p>
    ),
  },
  {
    titolo: "14. Elaborazione tecnica del pagamento",
    contenuto: (
      <p>
        InCittà può trasmettere al provider i dati necessari, ricevere gli esiti tecnici e
        aggiornare lo stato dell'ordine o del checkout. PayPal, Klarna, SEPA Direct Debit e
        bonifico istantaneo sono utilizzati, quando disponibili, attraverso l'integrazione
        Stripe; il bonifico istantaneo non è un bonifico bancario ordinario diretto al Venditore.
        Eventuali verifiche, autorizzazioni, rifiuti o ritardi dipendenti dal provider seguono le
        procedure del provider e il flusso applicabile. Le commissioni eventualmente spettanti a
        InCittà sono distinte dal prezzo della vendita secondo la configurazione applicabile e
        gli accordi con il Venditore.
      </p>
    ),
  },
  {
    titolo: "15. Consegna, ritiro o prestazione del servizio",
    contenuto: (
      <p>
        Il Venditore cura la consegna, il ritiro o l'esecuzione del servizio secondo l'offerta
        e l'ordine. InCittà fornisce gli strumenti tecnici per trasmettere e seguire le
        informazioni dell'ordine, ma non esegue normalmente la consegna o la prestazione del
        Venditore.
      </p>
    ),
  },
  {
    titolo: "16. Tempi e modalità di esecuzione",
    contenuto: (
      <p>
        Tempi, modalità e condizioni di esecuzione sono quelli indicati dal Venditore e
        applicabili alla specifica offerta. Il Venditore deve comunicare gli impedimenti rilevanti
        e gestire le richieste dell'Acquirente relative all'esecuzione, fatti salvi gli strumenti
        tecnici e le comunicazioni della piattaforma.
      </p>
    ),
  },
  {
    titolo: "17. Comunicazioni relative all'ordine",
    contenuto: (
      <p>
        InCittà può inviare comunicazioni tecniche sulla ricezione, sul pagamento e sullo stato
        dell'ordine. Il Venditore può inviare comunicazioni operative o commerciali relative
        alla vendita, alla consegna, al ritiro o alla prestazione.
      </p>
    ),
  },
  {
    titolo: "18. Annullamento dell'ordine",
    contenuto: (
      <p>
        L'annullamento dell'ordine può avvenire nei casi e secondo le modalità previste
        dall'offerta, dalle condizioni applicabili, dal flusso tecnico e dalla normativa. Il
        Venditore gestisce gli aspetti commerciali dell'annullamento; InCittà può aggiornare
        tecnicamente lo stato e trasmettere le comunicazioni previste.
      </p>
    ),
  },
  {
    titolo: "19. Diritto di recesso",
    contenuto: (
      <p>
        Il diritto di recesso, quando applicabile, è esercitato secondo le condizioni di vendita
        rese disponibili, le informazioni dell'offerta e la normativa applicabile. L'Acquirente
        può utilizzare i canali indicati per comunicare la richiesta al Venditore.
      </p>
    ),
  },
  {
    titolo: "20. Esclusioni e limitazioni del diritto di recesso",
    contenuto: (
      <p>
        Eventuali esclusioni o limitazioni del diritto di recesso dipendono dalla tipologia del
        prodotto, servizio o contenuto e dalla normativa applicabile. Non vengono introdotti in
        questa pagina termini o eccezioni ulteriori rispetto alle condizioni applicabili alla
        specifica vendita.
      </p>
    ),
  },
  {
    titolo: "21. Resi",
    contenuto: (
      <p>
        I resi sono gestiti dal Venditore secondo le condizioni della vendita, le informazioni
        dell'offerta e la normativa applicabile. InCittà può mettere a disposizione strumenti
        tecnici per comunicare la richiesta e conservarne le informazioni.
      </p>
    ),
  },
  {
    titolo: "22. Rimborsi",
    contenuto: (
      <p>
        Il Venditore gestisce la decisione commerciale sul rimborso nei casi applicabili. Dopo
        le autorizzazioni previste dal workflow, InCittà può eseguire tecnicamente il rimborso
        tramite il provider, secondo la configurazione del pagamento, e comunicare l'esito
        tecnico. Un reclamo o una richiesta non comportano automaticamente un rimborso e
        l'esecuzione tecnica non sostituisce la decisione commerciale del soggetto competente.
      </p>
    ),
  },
  {
    titolo: "23. Garanzia legale e conformità",
    contenuto: (
      <p>
        Il Venditore gestisce gli obblighi relativi alla garanzia legale, alla conformità e ai
        rimedi applicabili al prodotto o servizio nei limiti previsti dalla legge. InCittà non
        assume la garanzia commerciale del prodotto e non sostituisce il Venditore nella gestione
        della richiesta, fatti salvi gli obblighi direttamente applicabili alla piattaforma.
      </p>
    ),
  },
  {
    titolo: "24. Reclami",
    contenuto: (
      <p>
        L'Acquirente può utilizzare gli strumenti messi a disposizione dalla piattaforma per
        comunicare problemi relativi all'ordine. Il Venditore è il principale interlocutore per
        le questioni commerciali della vendita; InCittà gestisce tecnicamente il sistema di
        comunicazione, conservazione e gli eventuali meccanismi di escalation previsti.
      </p>
    ),
  },
  {
    titolo: "25. Prodotti o servizi non conformi",
    contenuto: (
      <p>
        Le richieste relative a prodotti o servizi non conformi devono essere comunicate al
        Venditore attraverso i canali disponibili. Il Venditore valuta e gestisce i rimedi
        applicabili secondo le condizioni della vendita e la normativa, mentre InCittà può
        fornire supporto tecnico agli strumenti di comunicazione e tracciamento.
      </p>
    ),
  },
  {
    titolo: "26. Obblighi del Venditore",
    contenuto: (
      <p>
        Il Venditore deve fornire informazioni corrette, mantenere aggiornate offerte e
        disponibilità, gestire gli ordini, eseguire la vendita o prestazione, curare consegna o
        ritiro, adempiere agli obblighi fiscali applicabili e gestire assistenza, recesso, resi,
        rimborsi, garanzia e conformità secondo le condizioni applicabili e la normativa.
      </p>
    ),
  },
  {
    titolo: "27. Obblighi dell'Acquirente",
    contenuto: (
      <ul>
        <li>fornire dati corretti e aggiornati;</li>
        <li>utilizzare legittimamente la piattaforma e l'account;</li>
        <li>proteggere le credenziali e segnalare accessi sospetti;</li>
        <li>autorizzare e utilizzare correttamente i pagamenti;</li>
        <li>non effettuare ordini fraudolenti o contestazioni abusive;</li>
        <li>comunicare in modo corretto e pertinente nei reclami;</li>
        <li>rispettare i diritti degli altri utenti e dei Venditori.</li>
      </ul>
    ),
  },
  {
    titolo: "28. Limitazioni del ruolo di InCittà",
    contenuto: (
      <p>
        InCittà non determina autonomamente i prezzi e le offerte dei Venditori, non vende
        direttamente i loro prodotti o servizi, non determina la disponibilità commerciale, non
        esegue normalmente la consegna o la prestazione, non assume la garanzia commerciale del
        prodotto e non sostituisce il Venditore nella gestione ordinaria del rapporto commerciale.
        InCittà fornisce la piattaforma e gli strumenti tecnici necessari alla gestione
        dell'ordine, senza limitare responsabilità o diritti inderogabili previsti dalla legge.
      </p>
    ),
  },
  {
    titolo: "29. Indisponibilità della piattaforma e cause tecniche",
    contenuto: (
      <p>
        Possono verificarsi manutenzioni, aggiornamenti, errori, ritardi o interruzioni dovuti a
        fattori tecnici o a servizi di terzi. InCittà adotta misure ragionevoli per mantenere i
        propri strumenti disponibili e sicuri e può comunicare gli eventi tecnici rilevanti
        attraverso i canali disponibili.
      </p>
    ),
  },
  {
    titolo: "30. Forza maggiore",
    contenuto: (
      <p>
        Eventi non ragionevolmente controllabili dal soggetto interessato possono incidere sul
        funzionamento della piattaforma o sull'esecuzione della vendita. Gli effetti di tali
        eventi devono essere valutati secondo le condizioni applicabili e la normativa vigente,
        mantenendo gli obblighi di comunicazione e collaborazione ragionevolmente possibili.
      </p>
    ),
  },
  {
    titolo: "31. Comunicazioni e assistenza",
    contenuto: (
      <p>
        Le comunicazioni relative al prodotto, al servizio, alla consegna, al ritiro, alla
        prestazione, al recesso, al reso, alla garanzia o al rimborso commerciale devono essere
        indirizzate al Venditore. InCittà può fornire assistenza tecnica sui propri strumenti,
        sul checkout, sulle comunicazioni e sul tracciamento tecnico dell'ordine.
      </p>
    ),
  },
  {
    titolo: "32. Legge applicabile e foro competente",
    contenuto: (
      <p>
        La legge applicabile e l'eventuale foro competente saranno determinati nel rispetto delle
        norme inderogabili applicabili all'Acquirente e degli eventuali diritti riconosciuti dalla
        normativa vigente.
      </p>
    ),
  },
  {
    titolo: "33. Modifiche alle Condizioni di vendita",
    contenuto: (
      <p>
        Le presenti Condizioni possono essere aggiornate per esigenze tecniche, organizzative,
        normative o di servizio. La versione applicabile all'ordine deve essere individuata
        secondo le informazioni rese disponibili nel relativo flusso. Le modifiche non incidono
        automaticamente sui rapporti già conclusi e sugli ordini già inviati, nel rispetto della
        normativa applicabile.
      </p>
    ),
  },
];

export default function CondizioniVenditaPage() {
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
              Documentazione della vendita
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-slate-900 md:text-4xl">
              Condizioni di vendita
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
