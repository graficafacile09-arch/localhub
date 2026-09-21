import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Termini per i Venditori",
  description: "Termini e condizioni per i Venditori che utilizzano la piattaforma InCittà.",
  alternates: {
    canonical: `${getSiteUrl()}/venditori`,
  },
};

const sezioni = [
  {
    titolo: "1. Premessa e ambito di applicazione",
    contenuto: (
      <>
        <p>
          I presenti Termini e condizioni disciplinano l&apos;utilizzo della piattaforma InCittà
          da parte dei soggetti che pubblicano e gestiscono offerte rivolte ai clienti. Il
          documento è una bozza operativa predisposta per la successiva revisione legale.
        </p>
        <p>
          I Termini si applicano alle funzioni rese disponibili al Venditore, insieme alle
          condizioni della piattaforma, alle regole operative comunicate da InCittà e alla
          normativa applicabile.
        </p>
      </>
    ),
  },
  {
    titolo: "2. Definizioni",
    contenuto: (
      <ul>
        <li><strong>InCittà</strong>: la piattaforma e l&apos;infrastruttura tecnologica gestita da [DENOMINAZIONE DEL GESTORE].</li>
        <li><strong>Gestore</strong>: [DENOMINAZIONE DEL GESTORE], con sede in [SEDE LEGALE], P.IVA [P.IVA].</li>
        <li><strong>Venditore</strong>: il soggetto che utilizza InCittà per pubblicare e offrire prodotti, servizi o altre prestazioni.</li>
        <li><strong>Cliente</strong>: il soggetto che consulta un&apos;offerta o acquista dal Venditore.</li>
        <li><strong>Negozio</strong>: lo spazio o profilo del Venditore pubblicato sulla piattaforma.</li>
        <li><strong>Offerta</strong>: la proposta relativa a un prodotto, servizio o prestazione pubblicata dal Venditore.</li>
        <li><strong>Ordine</strong>: la richiesta del Cliente relativa a un&apos;offerta, secondo il flusso applicabile.</li>
        <li><strong>Provider di pagamento</strong>: il soggetto terzo che fornisce l&apos;infrastruttura tecnica per il metodo di pagamento selezionato.</li>
      </ul>
    ),
  },
  {
    titolo: "3. Ruolo del Venditore sulla piattaforma",
    contenuto: (
      <>
        <p>
          Il Venditore determina i prodotti, i servizi o le prestazioni che intende offrire
          tramite il proprio spazio sulla piattaforma, nei limiti delle regole di InCittà e
          della normativa applicabile.
        </p>
        <p>
          Il Venditore cura le informazioni commerciali relative alle proprie offerte, la
          disponibilità, la gestione degli ordini e l&apos;esecuzione della prestazione dovuta al
          Cliente secondo il rapporto applicabile.
        </p>
      </>
    ),
  },
  {
    titolo: "4. Ruolo di InCittà",
    contenuto: (
      <>
        <p>
          InCittà mette a disposizione un&apos;infrastruttura tecnologica per pubblicare e
          consultare offerte, gestire il checkout, trasmettere dati dell&apos;ordine, fornire
          comunicazioni operative e supportare tecnicamente alcune fasi del rapporto tra
          Venditore e Cliente.
        </p>
        <p>
          InCittà può integrare provider di pagamento, strumenti di comunicazione e altri
          servizi tecnici necessari al funzionamento del marketplace. Restano fermi gli
          obblighi propri della piattaforma previsti dalla normativa applicabile.
        </p>
        <p>
          InCittà non assume, per il solo fatto di mettere a disposizione questi strumenti, il
          ruolo commerciale del Venditore. Questa distinzione non limita eventuali diritti
          inderogabili del Cliente o obblighi direttamente applicabili a InCittà.
        </p>
      </>
    ),
  },
  {
    titolo: "5. Requisiti per l&apos;apertura e gestione del negozio",
    contenuto: (
      <>
        <p>
          Per aprire o gestire un negozio il Venditore deve fornire le informazioni richieste
          dalla piattaforma, completare gli eventuali passaggi di registrazione e rispettare i
          requisiti applicabili al proprio ruolo e alla propria attività.
        </p>
        <p>
          L&apos;accesso alle funzioni operative può dipendere dallo stato dell&apos;account, dalle
          verifiche previste e dalla disponibilità dei servizi tecnici necessari.
        </p>
      </>
    ),
  },
  {
    titolo: "6. Identificazione del Venditore",
    contenuto: (
      <>
        <p>
          Il Venditore deve fornire informazioni accurate e aggiornate richieste da InCittà
          per la propria identificazione, per la pubblicazione delle offerte e per gli
          obblighi applicabili alla piattaforma o all&apos;attività del Venditore.
        </p>
        <p>
          InCittà può richiedere chiarimenti o documentazione aggiuntiva quando ciò sia
          necessario per il funzionamento della piattaforma, per la sicurezza, per la gestione
          dei pagamenti, per la tracciabilità del Venditore o per obblighi previsti dalla legge.
        </p>
      </>
    ),
  },
  {
    titolo: "7. Accuratezza e aggiornamento dei dati",
    contenuto: (
      <p>
        Il Venditore deve mantenere aggiornati i dati del proprio account, del negozio, delle
        offerte e dei recapiti utilizzati per le comunicazioni. Deve correggere senza ritardo
        le informazioni non più accurate e collaborare con InCittà quando un dato risulta
        incompleto, incoerente o non verificabile.
      </p>
    ),
  },
  {
    titolo: "8. Relazione tra Venditore, negozio e account",
    contenuto: (
      <>
        <p>
          L&apos;account utilizzato dal Venditore, il profilo del Venditore e il negozio sono
          elementi collegati secondo le regole tecniche della piattaforma. Il Venditore deve
          utilizzare soltanto account e profili per i quali dispone dell&apos;autorizzazione
          necessaria.
        </p>
        <p>
          InCittà può chiedere al Venditore di confermare il collegamento tra il soggetto che
          utilizza l&apos;account, il profilo del Venditore e il negozio gestito. Il Venditore non
          deve trasferire o condividere credenziali in modo contrario alle regole di sicurezza.
        </p>
      </>
    ),
  },
  {
    titolo: "9. Offerte, prodotti e servizi",
    contenuto: (
      <>
        <p>
          Il Venditore è responsabile della predisposizione delle proprie offerte e delle
          informazioni relative a prodotti, servizi e prestazioni. Le descrizioni devono essere
          comprensibili, pertinenti e coerenti con ciò che viene effettivamente offerto.
        </p>
        <p>
          Il Venditore deve considerare le caratteristiche del prodotto o servizio, le
          eventuali limitazioni applicabili e gli obblighi informativi previsti dalla normativa
          pertinente.
        </p>
      </>
    ),
  },
  {
    titolo: "10. Prezzi, disponibilità e informazioni commerciali",
    contenuto: (
      <>
        <p>
          Il Venditore inserisce e mantiene aggiornati i prezzi, la disponibilità, i costi
          eventualmente applicabili e le altre informazioni commerciali delle proprie offerte,
          nei limiti degli strumenti della piattaforma e della normativa applicabile.
        </p>
        <p>
          InCittà può effettuare controlli tecnici sui dati ricevuti e può chiedere correzioni
          quando un&apos;informazione appare incompleta, incoerente o potenzialmente fuorviante.
          Tali controlli non sostituiscono la responsabilità del Venditore sulle proprie offerte.
        </p>
      </>
    ),
  },
  {
    titolo: "11. Ordini ricevuti tramite InCittà",
    contenuto: (
      <p>
        Il Venditore può ricevere tramite InCittà informazioni relative agli ordini effettuati
        dai Clienti. Le informazioni disponibili dipendono dal flusso tecnico, dal metodo di
        pagamento, dalla modalità di consegna o ritiro e dalle impostazioni applicabili al
        negozio.
      </p>
    ),
  },
  {
    titolo: "12. Accettazione e gestione degli ordini",
    contenuto: (
      <>
        <p>
          Il Venditore deve verificare e gestire gli ordini ricevuti secondo le proprie
          procedure e le condizioni applicabili alla vendita. Deve mantenere aggiornata la
          disponibilità e comunicare tempestivamente eventuali impedimenti all&apos;esecuzione.
        </p>
        <p>
          L&apos;ordine può essere soggetto a verifiche tecniche, pagamento, disponibilità e
          altri passaggi previsti dal flusso. La gestione tecnica della piattaforma non
          sostituisce gli adempimenti commerciali del Venditore.
        </p>
      </>
    ),
  },
  {
    titolo: "13. Preparazione, consegna, ritiro o esecuzione della prestazione",
    contenuto: (
      <p>
        Il Venditore cura la preparazione del prodotto, la consegna, il ritiro o l&apos;esecuzione
        del servizio secondo quanto indicato nell&apos;offerta e nell&apos;ordine. Deve rispettare i
        tempi e le modalità comunicati al Cliente, nei casi e nei limiti previsti dalla
        normativa applicabile, informando il Cliente e InCittà degli impedimenti rilevanti.
      </p>
    ),
  },
  {
    titolo: "14. Comunicazioni con il Cliente",
    contenuto: (
      <p>
        Il Venditore deve utilizzare i canali messi a disposizione dalla piattaforma per le
        comunicazioni operative relative ai propri ordini, quando richiesto dal flusso. Le
        comunicazioni devono essere pertinenti, corrette e rispettose e non devono essere usate
        per inviare contenuti illeciti o non autorizzati.
      </p>
    ),
  },
  {
    titolo: "15. Pagamenti e flussi economici",
    contenuto: (
      <>
        <p>
          InCittà può mettere a disposizione un checkout e interfacciarsi tecnicamente con i
          provider di pagamento utilizzati dalla piattaforma. Il provider selezionato gestisce
          tecnicamente le operazioni relative al metodo mostrato nel checkout secondo le proprie
          condizioni.
        </p>
        <p>
          Gli importi, gli stati tecnici, le commissioni e gli eventuali payout sono gestiti
          secondo le configurazioni e i flussi applicabili al negozio e alla piattaforma. Il
          Venditore deve collaborare per le verifiche tecniche e fornire le informazioni
          necessarie quando richiesto.
        </p>
        <p>
          Questa sezione non introduce modalità di pagamento ulteriori né modifica i flussi
          tecnici esistenti.
        </p>
      </>
    ),
  },
  {
    titolo: "16. Fatturazione, ricevute e adempimenti fiscali",
    contenuto: (
      <p>
        Il Venditore cura la documentazione fiscale, le ricevute, la fatturazione e gli altri
        adempimenti fiscali propri della vendita o della prestazione, nei casi e nei modi
        previsti dalla normativa applicabile. InCittà può fornire dati o strumenti tecnici
        disponibili nel flusso, ma la verifica degli obblighi fiscali del Venditore richiede
        valutazione professionale e non è sostituita dalla piattaforma.
      </p>
    ),
  },
  {
    titolo: "17. Recesso, resi e rimborsi",
    contenuto: (
      <>
        <p>
          Il Venditore gestisce le richieste relative a recesso, reso e rimborso commerciale
          nei casi e nei termini previsti dalla normativa applicabile e dalle condizioni della
          specifica vendita.
        </p>
        <p>
          InCittà può fornire strumenti tecnici per comunicare una richiesta e, dopo le
          autorizzazioni previste dal workflow, eseguire tecnicamente un rimborso tramite il
          provider. L&apos;esecuzione tecnica non sostituisce la valutazione commerciale del
          soggetto competente.
        </p>
        <p>
          Eccezioni, termini, modalità di restituzione e condizioni del rimborso devono essere
          determinati nella documentazione applicabile e sottoposti a revisione legale.
        </p>
      </>
    ),
  },
  {
    titolo: "18. Garanzia legale e conformità",
    contenuto: (
      <p>
        Il Venditore gestisce gli obblighi relativi alla garanzia legale, alla conformità e ai
        rimedi applicabili ai propri prodotti, servizi o prestazioni, nei casi e nei termini
        previsti dalla normativa applicabile. Il Venditore deve fornire al Cliente informazioni
        corrette e collaborare alla gestione delle richieste. Non vengono introdotti in questa
        bozza termini, durate o eccezioni non ancora definiti legalmente.
      </p>
    ),
  },
  {
    titolo: "19. Reclami e assistenza al Cliente",
    contenuto: (
      <>
        <p>
          Il Venditore è il referente commerciale per le questioni relative ai propri prodotti,
          servizi e prestazioni. Deve leggere e gestire le comunicazioni ricevute dal Cliente e
          fornire una risposta coerente con il rapporto commerciale e la normativa applicabile.
        </p>
        <p>
          InCittà può mettere a disposizione un sistema tecnico di reclami, messaggistica,
          notifiche e conservazione delle comunicazioni. Il sistema non determina
          automaticamente l&apos;esito commerciale della questione.
        </p>
      </>
    ),
  },
  {
    titolo: "20. Sicurezza dei prodotti e conformità normativa",
    contenuto: (
      <p>
        Il Venditore deve offrire prodotti e servizi conformi ai requisiti applicabili alla
        propria attività e deve adottare le misure necessarie per la sicurezza, l&apos;informazione
        e la tracciabilità richieste dalla normativa pertinente. Deve informare tempestivamente
        InCittà di rischi, richiami, divieti o altri eventi che possano rendere un&apos;offerta non
        idonea alla pubblicazione.
      </p>
    ),
  },
  {
    titolo: "21. Contenuti pubblicati dal Venditore",
    contenuto: (
      <p>
        Il Venditore deve disporre del titolo o delle autorizzazioni necessarie per utilizzare
        sulla piattaforma descrizioni, immagini, loghi, fotografie, marchi e altri materiali.
        Deve verificare che i contenuti non violino diritti di terzi, norme applicabili o regole
        della piattaforma. InCittà può rimuovere o limitare la visibilità di contenuti nei casi
        previsti dai presenti Termini, dalla normativa o dagli accordi applicabili.
      </p>
    ),
  },
  {
    titolo: "22. Proprietà intellettuale",
    contenuto: (
      <>
        <p>
          Il Venditore conserva i diritti sui materiali che legittimamente pubblica, salvo i
          diritti di terzi e gli utilizzi necessari al funzionamento della piattaforma.
        </p>
        <p>
          Il Venditore autorizza InCittà a trattare e visualizzare tecnicamente tali materiali
          nella misura necessaria per pubblicare le offerte, mostrare il negozio, gestire gli
          ordini e fornire le funzioni richieste. La portata di eventuali licenze ulteriori sarà
          definita nella versione sottoposta a revisione legale.
        </p>
      </>
    ),
  },
  {
    titolo: "23. Protezione dei dati personali",
    contenuto: (
      <>
        <p>
          Il trattamento dei dati personali da parte di InCittà è descritto nella Privacy
          Policy applicabile. Il Venditore deve leggere la documentazione privacy e rispettare
          gli obblighi che gli competono in relazione alla propria attività, ai Clienti, ai
          dipendenti, ai collaboratori e ai fornitori.
        </p>
        <p>
          Questa sezione non determina autonomamente il ruolo privacy di InCittà o del
          Venditore per ogni singolo trattamento. Le qualificazioni e gli accordi eventualmente
          necessari devono essere verificati separatamente.
        </p>
      </>
    ),
  },
  {
    titolo: "24. Obblighi del Venditore nell&apos;utilizzo della piattaforma",
    contenuto: (
      <ul>
        <li>utilizzare l&apos;account e il negozio per finalità lecite e autorizzate;</li>
        <li>mantenere corretti i dati identificativi e commerciali;</li>
        <li>aggiornare offerte, prezzi e disponibilità;</li>
        <li>gestire gli ordini e le comunicazioni in modo tempestivo;</li>
        <li>collaborare alle verifiche tecniche e documentali;</li>
        <li>proteggere le credenziali e segnalare accessi sospetti;</li>
        <li>rispettare le regole della piattaforma e la normativa applicabile.</li>
      </ul>
    ),
  },
  {
    titolo: "25. Divieti e utilizzi non consentiti",
    contenuto: (
      <p>
        Non è consentito utilizzare InCittà per pubblicare offerte o contenuti illeciti,
        fraudolenti, ingannevoli, pericolosi o privi delle autorizzazioni necessarie; aggirare
        i controlli della piattaforma; manipolare ordini, disponibilità o pagamenti; utilizzare
        account altrui; violare i diritti di terzi; o compromettere la sicurezza, la continuità
        e il corretto funzionamento dei servizi.
      </p>
    ),
  },
  {
    titolo: "26. Sospensione o rimozione del negozio/account",
    contenuto: (
      <p>
        InCittà può limitare, sospendere o rimuovere un contenuto, un negozio o un account
        quando ciò sia ragionevolmente necessario in presenza di violazioni dei Termini, dati
        non corretti, attività fraudolente, rischi per la sicurezza, violazioni normative,
        richieste delle autorità, mancata collaborazione o violazioni reiterate.
        L&apos;intervento deve essere comunicato o motivato secondo quanto previsto dagli accordi
        applicabili e dalla normativa, salvo esigenze di sicurezza, riservatezza o urgenza che
        richiedano modalità diverse.
      </p>
    ),
  },
  {
    titolo: "27. Collaborazione con InCittà e richieste di informazioni",
    contenuto: (
      <p>
        Il Venditore deve collaborare in buona fede alle richieste ragionevoli di informazioni,
        chiarimenti o documenti necessarie per la sicurezza, la gestione tecnica degli ordini,
        la verifica delle offerte, la gestione delle segnalazioni o l&apos;adempimento di obblighi
        applicabili alla piattaforma. Le richieste devono essere valutate nel rispetto delle
        regole di protezione dei dati e degli obblighi di riservatezza.
      </p>
    ),
  },
  {
    titolo: "28. Commissioni, costi e pagamenti dovuti alla piattaforma",
    contenuto: (
      <p>
        Eventuali commissioni, costi o importi dovuti alla piattaforma sono quelli comunicati
        nelle condizioni commerciali o nelle configurazioni applicabili al Venditore. Il
        calcolo e il trattamento tecnico degli importi seguono i flussi della piattaforma e dei
        provider coinvolti. Le condizioni economiche specifiche e il relativo trattamento
        fiscale devono essere verificati prima della pubblicazione definitiva.
      </p>
    ),
  },
  {
    titolo: "29. Disponibilità tecnica della piattaforma",
    contenuto: (
      <p>
        InCittà adotta misure ragionevoli per mantenere disponibili e sicuri i propri strumenti,
        ma possono verificarsi manutenzioni, aggiornamenti, errori, ritardi o interruzioni
        dovuti a fattori tecnici, a servizi di terzi o ad altri eventi. Il Venditore deve
        utilizzare i canali disponibili per segnalare problemi che incidano sugli ordini o sui
        Clienti.
      </p>
    ),
  },
  {
    titolo: "30. Modifiche ai Termini per i Venditori",
    contenuto: (
      <p>
        I presenti Termini possono essere aggiornati per esigenze tecniche, organizzative,
        normative o di servizio. La versione pubblicata dovrà indicare la data di decorrenza e
        le modalità con cui il Venditore sarà informato. Gli effetti delle modifiche sui rapporti
        già in corso e sui negozi già attivi devono essere valutati secondo gli accordi e la
        normativa applicabile.
      </p>
    ),
  },
  {
    titolo: "31. Durata e cessazione del rapporto con la piattaforma",
    contenuto: (
      <p>
        Il rapporto tra Venditore e InCittà dura secondo le condizioni applicabili all&apos;account
        e ai servizi utilizzati. Il Venditore può chiedere la cessazione dell&apos;utilizzo del
        negozio secondo le procedure disponibili. La cessazione non elimina gli obblighi che,
        per loro natura, devono restare applicabili agli ordini, ai pagamenti, alle comunicazioni,
        ai dati o agli adempimenti già maturati.
      </p>
    ),
  },
  {
    titolo: "32. Legge applicabile e foro",
    contenuto: (
      <p>
        La legge applicabile e l&apos;eventuale foro competente saranno indicati nella versione
        sottoposta a revisione legale, tenendo conto della natura del Venditore, del rapporto
        con InCittà e delle norme inderogabili eventualmente applicabili.
      </p>
    ),
  },
  {
    titolo: "33. Contatti",
    contenuto: (
      <ul>
        <li><strong>Gestore:</strong> [DENOMINAZIONE DEL GESTORE]</li>
        <li><strong>Sede:</strong> [SEDE LEGALE]</li>
        <li><strong>P.IVA:</strong> [P.IVA]</li>
        <li><strong>PEC:</strong> [PEC]</li>
        <li><strong>Email:</strong> [EMAIL LEGALE]</li>
        <li><strong>Segnalazioni:</strong> [EMAIL SEGNALAZIONI]</li>
      </ul>
    ),
  },
  {
    titolo: "34. Versione e data del documento",
    contenuto: (
      <dl className="grid gap-2 sm:grid-cols-[180px_1fr]">
        <dt className="font-semibold text-slate-900">Stato</dt>
        <dd>Bozza operativa soggetta a revisione legale</dd>
        <dt className="font-semibold text-slate-900">Versione</dt>
        <dd>[VERSIONE DEL DOCUMENTO]</dd>
        <dt className="font-semibold text-slate-900">Data pubblicazione</dt>
        <dd>[DATA DI PUBBLICAZIONE]</dd>
        <dt className="font-semibold text-slate-900">Data validità</dt>
        <dd>[DATA DI ENTRATA IN VIGORE]</dd>
      </dl>
    ),
  },
];

export default function TerminiVenditoriPage() {
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
              Documentazione per i Venditori
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-slate-900 md:text-4xl">
              Termini e condizioni per i Venditori
            </h1>
            <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
              Documento in bozza soggetto a revisione legale prima della pubblicazione definitiva.
            </p>
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
