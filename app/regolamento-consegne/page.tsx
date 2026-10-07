"use client";

import Link from "next/link";

export default function RegolamentoConsegnePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            ← Torna a InCittà
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Regolamento Consegne
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Ultimo aggiornamento: 6 ottobre 2026
        </p>

        <div className="mt-8 space-y-8 text-[15px] leading-7 text-slate-700">
          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <h2 className="text-xl font-bold text-slate-900">In breve</h2>
            <p className="mt-2">
              InCittà mette a disposizione un'infrastruttura tecnologica e
              strumenti digitali per la gestione degli ordini e per facilitare
              il contatto autonomo tra venditori e soggetti terzi che effettuano
              consegne locali. La spedizione e la consegna materiale non sono
              svolte, organizzate o controllate da InCittà, ma sono effettuate
              autonomamente da soggetti terzi.
            </p>
            <p className="mt-2">
              Le funzionalità logistiche e di contatto sono gratuite per
              corrieri e consumatori. L'accesso dei venditori alla vetrina
              digitale e agli strumenti di vendita è invece disciplinato da
              separati rapporti B2B e dai relativi corrispettivi, canoni e
              tariffe applicabili.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">1. Oggetto del regolamento</h2>
            <p className="mt-2">
              Il presente regolamento disciplina l'utilizzo delle funzionalità
              tecnologiche di consegna locale collegate agli ordini effettuati
              tramite InCittà e chiarisce i ruoli e le responsabilità dei
              soggetti coinvolti. Esso integra, per quanto riguarda le
              consegne locali, i termini e le condizioni generali della
              piattaforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">2. Ruolo di InCittà</h2>
            <p className="mt-2">
              InCittà opera esclusivamente quale fornitore di infrastruttura
              digitale e mero intermediario tecnico. Mette a disposizione
              strumenti per la gestione dell'ordine, l'assegnazione autonoma
              del corriere da parte dei soggetti interessati, la comunicazione
              diretta e la visualizzazione degli stati operativi della
              consegna.
            </p>
            <p className="mt-2">
              Le funzionalità logistiche e di contatto sono gratuite per
              corrieri e consumatori. L'accesso dei venditori alla vetrina
              digitale e agli strumenti di vendita è invece regolato da
              contratti B2B e dai relativi corrispettivi, canoni e tariffe.
              I pagamenti effettuati dai venditori a InCittà riguardano
              esclusivamente la vetrina digitale, la fornitura tecnologica e
              gli strumenti di vendita e non costituiscono compensi per la
              consegna né percentuali sul relativo corrispettivo.
            </p>
            <p className="mt-2">
              InCittà non instaura rapporti di lavoro con vettori, corrieri o
              personale impiegato nella consegna, non assume il ruolo di datore
              di lavoro e non è prestatore materiale del servizio di consegna
              né organizzatore dell'attività logistica o del personale.
            </p>
            <p className="mt-2">
              Resta fermo che la qualificazione giuridica dei rapporti e gli
              obblighi previsti dalla legge dipendono dai fatti concreti e
              dalla normativa applicabile. Nessuna disposizione del presente
              regolamento esclude obblighi inderogabili o responsabilità che
              la legge eventualmente ponga a carico di InCittà o degli altri
              soggetti coinvolti.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">3. Come funziona la consegna locale</h2>
            <p className="mt-2">
              Quando un ordine prevede la consegna locale, il venditore può
              selezionare autonomamente, tra i soggetti disponibili sulla
              piattaforma, il corriere che effettuerà la consegna. Il sistema
              registra l'assegnazione e consente di seguire le principali fasi
              operative dell'ordine e della consegna.
            </p>
            <p className="mt-2">
              Le fasi visualizzate sulla piattaforma hanno finalità operative
              e informative e possono comprendere l'assegnazione,
              l'accettazione, la preparazione, il ritiro del pacco, la presa in
              consegna, la consegna e l'eventuale segnalazione di un problema.
              Tali stati non costituiscono verifica, certificazione o garanzia
              da parte di InCittà dell'effettiva esecuzione della consegna
              materiale.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">4. Ruolo del venditore</h2>
            <p className="mt-2">
              Il venditore è responsabile della corretta preparazione
              dell'ordine, dell'imballaggio, della conformità dei prodotti,
              della messa a disposizione del pacco per il ritiro e della
              corretta selezione del soggetto che effettuerà la consegna.
            </p>
            <p className="mt-2">
              Il venditore deve fornire informazioni corrette e sufficienti
              sull'ordine e collaborare con il soggetto incaricato della
              consegna per eventuali problemi relativi al ritiro o alla
              consegna. Eventuali errori o omissioni imputabili al venditore
              restano a suo carico nei confronti degli interessati secondo la
              normativa applicabile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">5. Soggetto terzo che effettua il servizio</h2>
            <p className="mt-2">
              Il trasporto e la consegna materiale sono effettuati da soggetti
              terzi indipendenti rispetto a InCittà. Il soggetto che presta il
              servizio è esclusivamente responsabile dell'organizzazione della
              propria attività, dei mezzi utilizzati e degli obblighi derivanti
              dalla legge e dai rapporti contrattuali effettivamente instaurati
              con il personale impiegato.
            </p>
            <p className="mt-2">
              Restano di competenza del soggetto cui spettano secondo legge e
              contratto gli obblighi relativi ai rapporti di lavoro o
              collaborazione, alla sicurezza ai sensi del D.Lgs. 81/2008,
              ai mezzi e alla loro manutenzione, agli adempimenti previdenziali,
              fiscali e assicurativi e agli ulteriori obblighi connessi allo
              svolgimento del servizio.
            </p>
            <p className="mt-2">
              Prima dell'avvio del servizio in forma pienamente operativa,
              l'organizzazione e i rapporti contrattuali con i soggetti terzi
              che effettueranno le consegne saranno definiti mediante separati
              accordi, secondo la normativa applicabile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">6. Ruolo del corriere</h2>
            <p className="mt-2">
              Il corriere utilizza l'area dedicata della piattaforma per
              visualizzare le consegne a lui assegnate, aggiornare gli stati
              operativi previsti dal sistema e segnalare eventuali anomalie o
              problemi relativi alla consegna.
            </p>
            <p className="mt-2">
              L'approvazione dell'account da parte dell'amministrazione InCittà
              abilita esclusivamente l'accesso tecnico all'area corriere. Tale
              approvazione non costituisce certificazione professionale,
              assunzione, autorizzazione amministrativa all'esercizio
              dell'attività di trasporto né attestazione della sussistenza dei
              requisiti legali, tecnici o morali eventualmente richiesti per
              lo svolgimento del servizio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">7. Rapporti di lavoro e compensi</h2>
            <p className="mt-2">
              InCittà non stabilisce tariffe o compensi dei corrieri, non
              organizza il lavoro, non determina turni, orari o soglie di
              disponibilità, non impartisce direttive vincolanti sull'attività
              lavorativa e non gestisce ferie, assenze o altri aspetti del
              rapporto tra il soggetto che presta il servizio e il personale
              impiegato.
            </p>
            <p className="mt-2">
              Gli accordi economici relativi al servizio di consegna e la
              remunerazione del personale sono regolati esclusivamente tra i
              soggetti terzi coinvolti nel servizio, secondo i rispettivi
              accordi e la normativa applicabile.
            </p>
            <p className="mt-2">
              I pagamenti effettuati dai venditori a InCittà sono esclusivamente
              relativi alla vetrina digitale, alla fornitura tecnologica e agli
              strumenti di vendita previsti dai rapporti B2B. InCittà non
              trattiene percentuali, commissioni o ricavi propri sulle tariffe
              di consegna materiale e non determina né gestisce la remunerazione
              del corriere o del vettore.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">8. Mezzi, manutenzione e assicurazioni</h2>
            <p className="mt-2">
              La proprietà o disponibilità dei mezzi utilizzati per le
              consegne, la loro idoneità tecnica, omologazione, manutenzione e
              sicurezza sono di competenza del soggetto terzo che li mette a
              disposizione e che effettua il servizio.
            </p>
            <p className="mt-2">
              Gli obblighi assicurativi, inclusi quelli relativi alla RCA,
              alla responsabilità del vettore, ai danni verso terzi, agli
              infortuni sul lavoro e alle eventuali coperture INAIL, fanno capo
              ai soggetti cui tali obblighi competono in base alla concreta
              attività svolta, ai rapporti instaurati e alla normativa
              applicabile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">9. Costi della consegna</h2>
            <p className="mt-2">
              Il costo della consegna eventualmente mostrato al consumatore è
              indicato secondo le configurazioni del venditore o secondo gli
              accordi tra venditore e soggetto che effettua la consegna. I
              relativi flussi economici tra venditore e prestatore del servizio
              di consegna sono esterni a InCittà.
            </p>
            <p className="mt-2">
              I ricavi di InCittà derivano esclusivamente dalla vetrina
              digitale e dai servizi tecnologici e dagli strumenti di vendita
              forniti ai venditori nell'ambito dei rapporti B2B. InCittà non
              percepisce alcuna quota, tariffa o provvigione sul corrispettivo
              della consegna materiale e non determina la remunerazione del
              corriere o del vettore.
            </p>
            <p className="mt-2">
              La visualizzazione del costo di consegna sulla piattaforma ha
              funzione informativa e operativa e non comporta l'assunzione da
              parte di InCittà del ruolo di prestatore, vettore o organizzatore
              della logistica materiale.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">10. Ordini, ritiro e consegna</h2>
            <p className="mt-2">
              Il venditore deve rendere il pacco disponibile per il ritiro
              secondo le modalità operative previste dalla piattaforma. Il
              corriere svolge autonomamente le attività di ritiro e consegna,
              nel rispetto della legge e degli obblighi applicabili.
            </p>
            <p className="mt-2">
              Eventuali disservizi, ritardi, mancati ritiri, danneggiamenti,
              smarrimenti o impossibilità di completare il servizio devono
              essere registrati, ove possibile, attraverso gli strumenti
              disponibili sulla piattaforma e gestiti tra venditore,
              consumatore e soggetto che effettua la consegna, secondo le
              rispettive responsabilità. InCittà resta estranea alla gestione
              materiale della controversia, fatti salvi gli obblighi
              inderogabili previsti dalla legge.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">11. Comunicazioni e dati personali</h2>
            <p className="mt-2">
              Le funzionalità di comunicazione e gli strumenti di gestione della
              consegna possono rendere disponibili ai soggetti coinvolti le
              informazioni strettamente necessarie alla gestione dell'ordine e
              della consegna.
            </p>
            <p className="mt-2">
              Il trattamento dei dati personali avviene secondo l'Informativa
              Privacy di InCittà e la normativa applicabile, incluso il
              Regolamento (UE) 2016/679 (GDPR). Ciascun utente professionale
              opera quale autonomo titolare del trattamento per i dati trattati
              nell'ambito delle proprie attività, nei limiti e secondo le
              rispettive responsabilità previste dalla normativa applicabile.
            </p>
            <p className="mt-2">
              Ciascun soggetto resta direttamente responsabile dei trattamenti
              illeciti, degli utilizzi non autorizzati dei dati e delle finalità
              ulteriori non consentite dalla legge o dagli accordi applicabili.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">12. Responsabilità e limiti del ruolo di InCittà</h2>
            <p className="mt-2">
              Ciascun soggetto resta responsabile degli obblighi che gli
              competono in base alla legge, ai contratti e alle concrete
              attività svolte. InCittà risponde esclusivamente del corretto
              funzionamento tecnico degli strumenti digitali messi a
              disposizione, nei limiti delle proprie condizioni d'uso e della
              normativa applicabile.
            </p>
            <p className="mt-2">
              In qualità di infrastruttura tecnologica e intermediario tecnico,
              InCittà non assume la responsabilità materiale della consegna e,
              nei limiti consentiti dalla legge, non risponde della conformità,
              sicurezza o liceità dei prodotti, dell'esecuzione del contratto
              di vendita tra consumatore e venditore né dei danni, smarrimenti,
              ritardi o mancata consegna imputabili al soggetto operativo
              legalmente responsabile.
            </p>
            <p className="mt-2">
              L'organizzazione del servizio, la disponibilità del corriere,
              la puntualità e la corretta esecuzione materiale della consegna
              restano a carico dei soggetti terzi cui tali attività competono.
              Restano in ogni caso ferme le responsabilità inderogabili che la
              legge non consenta di escludere o limitare.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">13. Modifiche del regolamento</h2>
            <p className="mt-2">
              Il presente regolamento può essere aggiornato in caso di
              evoluzione tecnica o strutturale della piattaforma, modifiche del
              modello operativo, introduzione o modifica di accordi con
              soggetti terzi che effettuano le consegne o modifiche della
              normativa applicabile. La versione pubblicata sulla piattaforma
              è quella vigente, salvo i casi in cui la legge richieda
              modalità diverse di comunicazione o decorrenza.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">14. Normativa applicabile e prevalenza dei contratti</h2>
            <p className="mt-2">
              Il servizio è disciplinato dalla normativa italiana ed europea
              applicabile, incluse, per quanto pertinenti al caso concreto, le
              disposizioni inderogabili in materia di commercio elettronico,
              tutela dei consumatori, trasporto, lavoro, sicurezza,
              assicurazioni e protezione dei dati personali.
            </p>
            <p className="mt-2">
              Il presente regolamento deve essere interpretato insieme alle
              altre condizioni e informative pubblicate da InCittà. I separati
              contratti bilaterali con venditori e partner logistici prevalgono,
              nei limiti consentiti dalla legge, per quanto riguarda gli
              specifici rapporti contrattuali da essi disciplinati.
            </p>
          </section>

          <section className="border-t border-slate-200 pt-6 text-sm text-slate-500">
            <p>
              © 2026 InCittà · Castrovillari · Privacy · Termini e condizioni
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
