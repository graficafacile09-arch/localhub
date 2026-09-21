import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Termini e condizioni",
  description: "Termini e condizioni della piattaforma InCittà.",
  alternates: {
    canonical: `${getSiteUrl()}/termini`,
  },
};

const sezioni = [
  {
    titolo: "1. Premessa",
    contenuto: (
      <>
        <p>
          I presenti Termini e condizioni descrivono le regole generali di utilizzo della
          piattaforma InCittà e dei relativi strumenti tecnologici.
        </p>
        <p>
          L'utilizzo della piattaforma può coinvolgere rapporti distinti tra InCittà,
          i venditori e i clienti. Le condizioni applicabili alla singola vendita devono
          essere lette insieme alle informazioni e alle condizioni rese disponibili dal
          venditore.
        </p>
      </>
    ),
  },
  {
    titolo: "2. Definizioni",
    contenuto: (
      <ul>
        <li><strong>InCittà</strong>: la piattaforma e l'infrastruttura tecnologica gestita da [DENOMINAZIONE DEL GESTORE].</li>
        <li><strong>Gestore</strong>: [DENOMINAZIONE DEL GESTORE], con sede in [SEDE LEGALE], P.IVA [P.IVA].</li>
        <li><strong>Venditore</strong>: il soggetto che pubblica un'offerta e propone al cliente un prodotto, un servizio o altra prestazione.</li>
        <li><strong>Cliente</strong>: la persona che utilizza la piattaforma e può acquistare dal venditore.</li>
        <li><strong>Piattaforma</strong>: il sito, il checkout, le aree account e gli strumenti tecnici collegati a InCittà.</li>
        <li><strong>Provider di pagamento</strong>: il soggetto terzo che fornisce l'infrastruttura tecnica per il pagamento selezionato.</li>
        <li><strong>Ordine</strong>: la richiesta di acquisto o prenotazione riferita a un'offerta del venditore, secondo il flusso applicabile.</li>
      </ul>
    ),
  },
  {
    titolo: "3. Cos'è InCittà",
    contenuto: (
      <>
        <p>
          InCittà è una piattaforma digitale orientata alla consultazione di offerte locali e
          alla gestione tecnica di alcune fasi del rapporto tra cliente e venditore.
        </p>
        <p>
          La piattaforma può consentire di visualizzare negozi, prodotti, servizi e offerte,
          avviare un checkout, trasmettere dati dell'ordine e ricevere comunicazioni sullo
          stato tecnico dell'operazione.
        </p>
      </>
    ),
  },
  {
    titolo: "4. Ruolo di InCittà",
    contenuto: (
      <>
        <p>
          InCittà mette a disposizione strumenti tecnologici per il funzionamento del
          marketplace, tra cui pubblicazione e consultazione delle offerte, checkout,
          gestione tecnica degli ordini, comunicazioni operative, tracciamento tecnico dello
          stato dell'ordine, strumenti per comunicazioni e reclami e misure di sicurezza.
        </p>
        <p>
          InCittà può inoltre interfacciarsi tecnicamente con provider di pagamento e altri
          fornitori necessari al funzionamento della piattaforma. Le attività tecniche svolte
          dalla piattaforma non modificano, da sole, la natura del rapporto commerciale tra
          cliente e venditore.
        </p>
        <p>
          Restano fermi gli obblighi eventualmente attribuiti direttamente a InCittà dalla
          normativa applicabile e i diritti inderogabili riconosciuti al cliente.
        </p>
      </>
    ),
  },
  {
    titolo: "5. Ruolo del Venditore",
    contenuto: (
      <>
        <p>
          Il venditore è il soggetto che presenta l'offerta e propone al cliente il
          prodotto, il servizio o la prestazione descritta nella piattaforma.
        </p>
        <p>
          Il venditore cura, secondo il rapporto applicabile e la normativa vigente, le
          informazioni sulla propria offerta, la disponibilità, l'esecuzione della
          prestazione, la consegna o il ritiro, la conformità, la garanzia, i reclami
          commerciali, i resi e le richieste di rimborso di propria competenza.
        </p>
        <p>
          Le condizioni specifiche del venditore possono integrare i presenti Termini e sono
          rese disponibili nei punti pertinenti della piattaforma.
        </p>
      </>
    ),
  },
  {
    titolo: "6. Rapporto commerciale tra Cliente e Venditore",
    contenuto: (
      <>
        <p>
          La vendita o la prestazione richiesta dal cliente è riferita al venditore indicato
          nell'offerta e nel riepilogo dell'ordine. Il cliente deve verificare le
          informazioni del venditore e le condizioni della specifica vendita prima di
          completare il checkout.
        </p>
        <p>
          Prezzi, disponibilità, caratteristiche dell'offerta, modalità di esecuzione,
          consegna, ritiro, recesso, resi, garanzia e conformità devono essere valutati in
          relazione al venditore e al prodotto o servizio interessato, fatti salvi gli obblighi
          eventualmente applicabili a InCittà.
        </p>
      </>
    ),
  },
  {
    titolo: "7. Registrazione e utilizzo della piattaforma",
    contenuto: (
      <>
        <p>
          Alcune funzioni possono richiedere la registrazione o l'accesso a un account.
          Altre funzioni, incluso il checkout guest quando disponibile, possono essere
          utilizzate senza creare un account.
        </p>
        <p>
          Le informazioni fornite dall'utente devono essere accurate, aggiornate e
          utilizzate nel rispetto delle istruzioni della piattaforma e della normativa
          applicabile.
        </p>
      </>
    ),
  },
  {
    titolo: "8. Account e sicurezza",
    contenuto: (
      <>
        <p>
          L'utente deve proteggere le proprie credenziali e informare tempestivamente il
          Gestore in caso di accesso non autorizzato o di sospetto uso improprio dell'account.
        </p>
        <p>
          Le funzioni disponibili possono dipendere dal tipo di account, dal ruolo assegnato,
          dalle verifiche effettuate e dallo stato della piattaforma.
        </p>
      </>
    ),
  },
  {
    titolo: "9. Utilizzo corretto della piattaforma",
    contenuto: (
      <p>
        L'utente deve utilizzare InCittà in modo lecito, corretto e conforme alla sua
        funzione. Non deve compromettere la sicurezza, aggirare i controlli, utilizzare dati
        altrui senza autorizzazione, introdurre contenuti dannosi o usare la piattaforma per
        attività fraudolente, illecite o non autorizzate.
      </p>
    ),
  },
  {
    titolo: "10. Offerte, prodotti e servizi pubblicati dai Venditori",
    contenuto: (
      <>
        <p>
          Le offerte sono pubblicate o gestite dai venditori tramite gli strumenti messi a
          disposizione dalla piattaforma. Le informazioni visualizzate devono essere verificate
          dall'utente prima dell'acquisto.
        </p>
        <p>
          InCittà può adottare controlli tecnici, richiedere aggiornamenti o limitare la
          visibilità di contenuti e offerte nei casi previsti dalle regole della piattaforma,
          dagli accordi applicabili o dalla normativa.
        </p>
      </>
    ),
  },
  {
    titolo: "11. Ordini e checkout",
    contenuto: (
      <>
        <p>
          Il checkout raccoglie e trasmette le informazioni necessarie per avviare o gestire
          tecnicamente un ordine. Il sistema può verificare dati, disponibilità, importi e
          condizioni prima di accettare la richiesta.
        </p>
        <p>
          Il riepilogo dell'ordine indica, per quanto applicabile, il venditore, i prodotti
          o servizi, gli importi, la modalità di consegna o ritiro e il metodo di pagamento
          selezionato. La formazione e gli effetti della vendita sono disciplinati dalle
          condizioni applicabili alla specifica offerta.
        </p>
        <p>
          Per i flussi in cui il pagamento viene avviato prima della creazione dell'ordine,
          la piattaforma può conservare tecnicamente un intento di checkout fino alla conferma
          dell'esito del pagamento, secondo il flusso applicabile.
        </p>
      </>
    ),
  },
  {
    titolo: "12. Pagamenti e provider di pagamento",
    contenuto: (
      <>
        <p>
          Il pagamento può essere gestito tramite il provider e il metodo mostrati nel
          checkout. Il provider esegue le operazioni tecniche relative al metodo selezionato,
          secondo le proprie condizioni e procedure.
        </p>
        <p>
          InCittà può trasmettere al provider i dati necessari e aggiornare tecnicamente lo
          stato dell'ordine sulla base delle informazioni ricevute. La presenza di un
          provider nel checkout non attribuisce a InCittà la vendita del prodotto o del
          servizio.
        </p>
        <p>
          Eventuali richieste relative al prodotto, alla prestazione o alla soluzione
          commerciale devono essere indirizzate al venditore, salvo il supporto tecnico che
          InCittà può fornire attraverso i propri canali.
        </p>
      </>
    ),
  },
  {
    titolo: "13. Comunicazioni relative agli ordini",
    contenuto: (
      <p>
        InCittà può inviare comunicazioni tecniche relative alla ricezione, allo stato, al
        pagamento, alla consegna, al ritiro o ad altri eventi dell'ordine. Le comunicazioni
        possono essere inviate anche dal venditore o da un provider coinvolto nel flusso.
        L'indirizzo e-mail o gli altri recapiti forniti devono essere verificati dall'utente.
      </p>
    ),
  },
  {
    titolo: "14. Reclami e comunicazioni tra Cliente e Venditore",
    contenuto: (
      <>
        <p>
          InCittà può fornire strumenti tecnici per aprire un reclamo, conservare le
          comunicazioni, notificare il venditore e consentire lo scambio di messaggi.
        </p>
        <p>
          Il venditore è il referente della questione commerciale relativa al prodotto o
          servizio. L'apertura di un reclamo non determina automaticamente un rimborso, un
          reso, una sostituzione, una decisione sulla garanzia o la chiusura dell'ordine.
        </p>
        <p>
          Eventuali operazioni tecniche di rimborso sono eseguite secondo il workflow
          applicabile e dopo le autorizzazioni previste; ciò non sostituisce la determinazione
          della soluzione commerciale da parte del soggetto competente.
        </p>
      </>
    ),
  },
  {
    titolo: "15. Contenuti pubblicati dagli utenti e dai Venditori",
    contenuto: (
      <p>
        Gli utenti e i venditori devono pubblicare contenuti pertinenti, accurati e leciti e
        devono disporre dei diritti necessari per utilizzarli. Il contenuto dell'offerta e
        delle comunicazioni resta riferito al soggetto che lo pubblica, fatti salvi i controlli
        e gli interventi tecnici previsti dalla piattaforma o dalla legge.
      </p>
    ),
  },
  {
    titolo: "16. Segnalazioni di contenuti o attività illecite",
    contenuto: (
      <p>
        Segnalazioni relative a contenuti, offerte o attività potenzialmente illecite possono
        essere inviate a [EMAIL SEGNALAZIONI]. La segnalazione dovrebbe contenere informazioni
        sufficienti per consentire una verifica tecnica e, quando necessario, l'eventuale
        intervento previsto dalle regole della piattaforma o dalla normativa applicabile.
      </p>
    ),
  },
  {
    titolo: "17. Sospensione o limitazione degli account",
    contenuto: (
      <p>
        In presenza di motivi tecnici, di sicurezza, di violazioni delle regole applicabili,
        di richieste delle autorità o di altri presupposti previsti dalla legge o dagli accordi
        applicabili, l'accesso a una funzione o a un account può essere limitato o sospeso.
        Le modalità, le comunicazioni e gli eventuali strumenti di contestazione devono essere
        interpretati nel rispetto dei diritti applicabili all'utente.
      </p>
    ),
  },
  {
    titolo: "18. Disponibilità e funzionamento tecnico della piattaforma",
    contenuto: (
      <p>
        InCittà adotta misure ragionevoli per mantenere disponibili e sicuri i propri servizi,
        ma possono verificarsi manutenzioni, aggiornamenti, sospensioni, errori o interruzioni
        dovuti a fattori tecnici o a servizi di terzi. Gli interventi non incidono sui diritti
        inderogabili riconosciuti dalla normativa applicabile.
      </p>
    ),
  },
  {
    titolo: "19. Collegamenti e servizi di terze parti",
    contenuto: (
      <p>
        La piattaforma può collegarsi a servizi di terzi, inclusi provider di pagamento,
        strumenti di comunicazione, hosting o altri servizi tecnici. Tali servizi possono avere
        condizioni e informative proprie. Il loro utilizzo deve essere valutato secondo il
        flusso e il servizio concretamente scelti.
      </p>
    ),
  },
  {
    titolo: "20. Proprietà intellettuale",
    contenuto: (
      <p>
        I segni distintivi, il software, la struttura, i contenuti e gli elementi grafici di
        InCittà sono utilizzabili nei limiti consentiti dalla piattaforma e dalla normativa
        applicabile. Gli utenti e i venditori conservano i diritti di cui dispongono sui propri
        contenuti, concedendo soltanto gli utilizzi tecnici necessari alla pubblicazione e al
        funzionamento dei servizi.
      </p>
    ),
  },
  {
    titolo: "21. Protezione dei dati personali",
    contenuto: (
      <p>
        Il trattamento dei dati personali è descritto nella Privacy Policy di InCittà.
        Le informazioni presenti nei presenti Termini non sostituiscono l'informativa privacy
        né eventuali consensi separati richiesti dalla normativa.
      </p>
    ),
  },
  {
    titolo: "22. Cookie",
    contenuto: (
      <p>
        L'uso di cookie e altri strumenti di tracciamento è descritto nella Cookie Policy.
      </p>
    ),
  },
  {
    titolo: "23. Modifiche ai Termini",
    contenuto: (
      <p>
        I presenti Termini possono essere aggiornati per esigenze tecniche, organizzative,
        normative o di servizio. La versione pubblicata dovrà indicare la data di decorrenza e
        le modalità con cui gli utenti saranno informati delle modifiche. Gli effetti sui
        rapporti già in corso e sugli ordini già conclusi devono essere valutati secondo la
        normativa applicabile.
      </p>
    ),
  },
  {
    titolo: "24. Legge applicabile e foro",
    contenuto: (
      <p>
        La legge applicabile e l'eventuale foro competente saranno indicati nel rispetto delle
        norme inderogabili applicabili ai consumatori e degli eventuali diritti riconosciuti
        dalla normativa vigente.
      </p>
    ),
  },
  {
    titolo: "25. Contatti",
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
    titolo: "26. Data e versione del documento",
    contenuto: (
      <dl className="grid gap-2 sm:grid-cols-[180px_1fr]">
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
              Termini e Condizioni della Piattaforma InCittà
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
