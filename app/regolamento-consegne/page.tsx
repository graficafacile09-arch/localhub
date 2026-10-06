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
              InCittà mette a disposizione gratuitamente una piattaforma
              tecnologica che consente di gestire ordini e facilitare il
              collegamento tra venditori e soggetti che effettuano consegne
              locali. La consegna materiale non è svolta da InCittà, ma da
              soggetti terzi che prestano il relativo servizio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">1. Oggetto del regolamento</h2>
            <p className="mt-2">
              Il presente regolamento disciplina il funzionamento del servizio
              di consegna locale collegato agli ordini effettuati tramite
              InCittà e chiarisce i ruoli dei soggetti coinvolti. Esso integra,
              per quanto riguarda le consegne locali, i termini e le condizioni
              generali della piattaforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">2. Ruolo di InCittà</h2>
            <p className="mt-2">
              InCittà è una piattaforma tecnologica. Fornisce gratuitamente gli
              strumenti digitali necessari alla gestione dell'ordine, alla
              selezione del corriere, alla comunicazione tra gli utenti
              coinvolti e alla visualizzazione dello stato della consegna.
            </p>
            <p className="mt-2">
              Per il solo utilizzo della piattaforma, InCittà non instaura con
              il corriere un rapporto di lavoro e non assume il ruolo di datore
              di lavoro, prestatore materiale del servizio di consegna o
              organizzatore del rapporto di lavoro tra il soggetto che presta
              il servizio e il personale impiegato.
            </p>
            <p className="mt-2">
              Resta fermo che la qualificazione giuridica dei rapporti e gli
              obblighi previsti dalla legge dipendono dai fatti concreti e
              dalla normativa applicabile. Nessuna disposizione del presente
              regolamento esclude obblighi inderogabili eventualmente posti
              dalla legge a carico di InCittà o degli altri soggetti coinvolti.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">3. Come funziona la consegna locale</h2>
            <p className="mt-2">
              Quando un ordine prevede la consegna locale, il venditore può
              selezionare, tra i corrieri disponibili sulla piattaforma, il
              soggetto che effettuerà la consegna. Il sistema registra
              l'assegnazione e consente di seguire le principali fasi operative
              dell'ordine e della consegna.
            </p>
            <p className="mt-2">
              Le fasi visualizzate sulla piattaforma hanno finalità operative e
              informative: possono comprendere l'assegnazione, l'accettazione,
              il ritiro del pacco, la presa in consegna, la consegna e
              l'eventuale segnalazione di un problema.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">4. Ruolo del venditore</h2>
            <p className="mt-2">
              Il venditore è responsabile della corretta preparazione
              dell'ordine e della messa a disposizione del pacco per il ritiro.
              È inoltre il soggetto che seleziona il corriere tra quelli
              disponibili per la consegna locale.
            </p>
            <p className="mt-2">
              Il venditore deve fornire informazioni corrette e sufficienti per
              consentire l'esecuzione della consegna e deve collaborare con il
              soggetto incaricato del servizio per eventuali problemi relativi
              all'ordine.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">5. Soggetto terzo che effettua il servizio</h2>
            <p className="mt-2">
              Il servizio materiale di consegna è prestato da soggetti terzi
              rispetto a InCittà. Il soggetto che presta il servizio è
              responsabile dell'organizzazione della propria attività e degli
              obblighi che gli competono in base alla legge e al rapporto
              contrattuale effettivamente instaurato con il personale
              impiegato.
            </p>
            <p className="mt-2">
              In particolare, restano di competenza del soggetto cui spettano
              secondo legge e contratto gli obblighi relativi al rapporto di
              lavoro o di collaborazione, ai compensi, agli orari e alle
              condizioni di lavoro, alla sicurezza, ai mezzi utilizzati, alla
              manutenzione, agli adempimenti assicurativi e agli altri
              obblighi connessi allo svolgimento del servizio.
            </p>
            <p className="mt-2">
              Prima dell'avvio del servizio in forma pienamente operativa,
              l'organizzazione e i rapporti contrattuali con i soggetti terzi
              che effettueranno le consegne saranno definiti secondo la
              normativa applicabile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">6. Ruolo del corriere</h2>
            <p className="mt-2">
              Il corriere utilizza l'area dedicata della piattaforma per
              visualizzare le consegne a lui assegnate, gestire gli stati
              operativi previsti dal sistema e comunicare eventuali problemi
              relativi alla consegna.
            </p>
            <p className="mt-2">
              L'approvazione dell'account da parte dell'amministrazione InCittà
              riguarda l'accesso e l'abilitazione all'utilizzo dell'area
              corriere della piattaforma. Tale approvazione non costituisce
              certificazione professionale, assunzione, autorizzazione
              amministrativa all'esercizio dell'attività di trasporto né
              attestazione della sussistenza dei requisiti previsti dalla
              legge per lo svolgimento del servizio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">7. Rapporti di lavoro e compensi</h2>
            <p className="mt-2">
              InCittà non stabilisce il compenso del corriere, non organizza il
              rapporto di lavoro, non determina turni o orari di lavoro e non
              gestisce ferie, assenze o altri aspetti del rapporto tra il
              soggetto che offre il servizio e il personale impiegato.
            </p>
            <p className="mt-2">
              Gli accordi economici relativi al servizio di consegna e la
              remunerazione del personale sono regolati dai soggetti che
              partecipano al rapporto di fornitura del servizio, secondo gli
              accordi tra loro e la normativa applicabile. InCittà non trattiene
              commissioni o ricavi propri sul servizio di consegna.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">8. Mezzi, manutenzione e assicurazioni</h2>
            <p className="mt-2">
              I mezzi utilizzati per le consegne, la loro disponibilità,
              idoneità, manutenzione e sicurezza sono di competenza del soggetto
              che li mette a disposizione e che effettua il servizio, secondo
              quanto previsto dalla legge e dagli accordi applicabili.
            </p>
            <p className="mt-2">
              Gli obblighi assicurativi, inclusi quelli relativi agli infortuni
              sul lavoro e alle eventuali coperture richieste per l'attività,
              fanno capo ai soggetti cui tali obblighi competono in base alla
              normativa applicabile e alla concreta configurazione del rapporto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">9. Costi della consegna</h2>
            <p className="mt-2">
              Il costo eventualmente applicato per la consegna locale è
              indicato secondo le modalità previste dalla piattaforma e può
              essere configurato dal venditore. Gli accordi economici tra
              venditore e soggetto che presta il servizio di consegna sono
              estranei ai ricavi di InCittà.
            </p>
            <p className="mt-2">
              InCittà non percepisce una quota del corrispettivo del servizio
              di consegna e non determina la remunerazione spettante al
              corriere o al soggetto che presta il servizio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">10. Ordini, ritiro e consegna</h2>
            <p className="mt-2">
              Il venditore deve rendere il pacco disponibile per il ritiro
              secondo le modalità operative indicate dalla piattaforma. Il
              corriere procede alle attività di ritiro e consegna secondo la
              propria organizzazione e nel rispetto degli obblighi applicabili.
            </p>
            <p className="mt-2">
              Eventuali ritardi, mancati ritiri, problemi di consegna o
              impossibilità di completare il servizio devono essere segnalati
              attraverso gli strumenti disponibili sulla piattaforma e, quando
              necessario, direttamente ai soggetti interessati.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">11. Comunicazioni e dati</h2>
            <p className="mt-2">
              Le funzionalità di comunicazione e gli strumenti di gestione della
              consegna possono rendere disponibili ai soggetti coinvolti le
              informazioni strettamente necessarie alla gestione dell'ordine e
              della consegna.
            </p>
            <p className="mt-2">
              Il trattamento dei dati personali avviene secondo l'Informativa
              Privacy di InCittà e la normativa applicabile in materia di
              protezione dei dati personali.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">12. Responsabilità</h2>
            <p className="mt-2">
              Ciascun soggetto resta responsabile degli obblighi che gli
              competono in base alla legge, ai contratti e alle concrete
              attività svolte. Il presente regolamento non trasferisce a InCittà
              obblighi che la legge pone a carico di altri soggetti e non
              esclude eventuali responsabilità inderogabili previste dalla
              normativa.
            </p>
            <p className="mt-2">
              InCittà si occupa del funzionamento degli strumenti tecnologici
              messi a disposizione e della corretta gestione delle informazioni
              presenti sulla piattaforma nei limiti previsti dalle proprie
              condizioni d'uso e dalla normativa applicabile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">13. Modifiche del regolamento</h2>
            <p className="mt-2">
              Il presente regolamento può essere aggiornato in caso di
              modifiche della piattaforma, del servizio, degli accordi con i
              soggetti che effettuano le consegne o della normativa applicabile.
              La versione pubblicata su questa pagina è quella vigente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">14. Normativa applicabile</h2>
            <p className="mt-2">
              Il servizio è disciplinato dalla normativa italiana ed europea
              applicabile, incluse le disposizioni inderogabili in materia di
              lavoro, sicurezza, assicurazioni, trasporto, protezione dei dati
              personali e tutela dei consumatori, per quanto pertinenti al caso
              concreto.
            </p>
            <p className="mt-2">
              Il presente regolamento deve essere interpretato insieme alle
              altre condizioni e informative pubblicate da InCittà.
            </p>
          </section>

          <section className="border-t border-slate-200 pt-6 text-sm text-slate-500">
            <p>
              Il presente testo descrive il modello operativo della piattaforma
              e non sostituisce gli accordi contrattuali tra i soggetti che
              prestano il servizio di consegna né le disposizioni inderogabili
              previste dalla legge.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
