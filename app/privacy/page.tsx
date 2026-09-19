"use client";

import Link from "next/link";

export default function PrivacyPage() {
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
          Informativa Privacy
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Ultimo aggiornamento: 19 settembre 2026
        </p>

        <div className="mt-8 space-y-8 text-[15px] leading-7 text-slate-700">
          <section>
            <h2 className="text-xl font-bold text-slate-900">1. Titolare del trattamento</h2>
            <p className="mt-2">
              InCittà è la piattaforma digitale dedicata a negozi, prodotti,
              servizi, offerte, contenuti e iniziative del territorio.
              Il titolare del trattamento è il soggetto che gestisce la
              piattaforma InCittà. Per le richieste relative alla privacy è
              possibile utilizzare i recapiti pubblicati sul sito e le
              funzionalità di contatto disponibili sulla piattaforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">2. Dati trattati</h2>
            <p className="mt-2">
              A seconda dei servizi utilizzati, InCittà può trattare dati
              identificativi e di contatto, credenziali di accesso, dati
              necessari alla gestione dell'account, dati relativi agli ordini
              e alle richieste effettuate, dati forniti dagli esercenti per la
              gestione della propria attività, oltre ai dati tecnici necessari
              al funzionamento e alla sicurezza del sito.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">3. Registrazione e autenticazione</h2>
            <p className="mt-2">
              Per la registrazione con email e password i dati vengono
              utilizzati per creare e gestire l'account. InCittà consente
              inoltre l'autenticazione tramite Google e, quando disponibile,
              Apple. In questi casi il provider comunica a InCittà i dati
              necessari a identificare l'account, nel rispetto delle
              impostazioni e delle autorizzazioni previste dal provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">4. Finalità del trattamento</h2>
            <p className="mt-2">
              I dati sono trattati, in particolare, per creare e gestire gli
              account, consentire l'accesso ai servizi, gestire ordini e
              richieste, fornire le funzionalità richieste dagli utenti,
              prevenire abusi e accessi non autorizzati, garantire la sicurezza
              della piattaforma e adempiere agli obblighi di legge.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">5. Base giuridica</h2>
            <p className="mt-2">
              Il trattamento può essere fondato sull'esecuzione di un contratto
              o di misure precontrattuali, sull'adempimento di obblighi di legge,
              sul legittimo interesse del titolare per sicurezza e prevenzione
              degli abusi e, nei casi in cui sia necessario, sul consenso
              dell'interessato.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">6. Servizi di terze parti</h2>
            <p className="mt-2">
              La piattaforma può utilizzare fornitori tecnologici per
              autenticazione, hosting, database, pagamenti, comunicazioni,
              sicurezza e altri servizi necessari al funzionamento di InCittà.
              Quando l'utente sceglie un'autenticazione sociale, il relativo
              trattamento da parte del provider è disciplinato anche dalla
              documentazione privacy del provider stesso.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">7. Conservazione</h2>
            <p className="mt-2">
              I dati sono conservati per il tempo necessario alle finalità per
              cui sono stati raccolti e, successivamente, nei limiti dei tempi
              richiesti dalla legge o necessari per la tutela dei diritti del
              titolare.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">8. Sicurezza</h2>
            <p className="mt-2">
              InCittà adotta misure tecniche e organizzative ragionevoli per
              proteggere i dati da accessi non autorizzati, perdita, uso
              improprio o alterazione.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">9. Diritti dell'interessato</h2>
            <p className="mt-2">
              Nei limiti previsti dal Regolamento (UE) 2016/679, l'interessato
              può chiedere accesso, rettifica, cancellazione, limitazione del
              trattamento, opposizione e, quando applicabile, portabilità dei
              dati. Le richieste possono essere rivolte al titolare attraverso
              i recapiti pubblicati sul sito.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">10. Cookie e tecnologie simili</h2>
            <p className="mt-2">
              InCittà può utilizzare cookie e tecnologie tecniche necessarie
              alla navigazione, alla gestione della sessione, alla sicurezza e
              al corretto funzionamento del servizio. Eventuali cookie non
              necessari saranno utilizzati secondo le impostazioni e le
              informative applicabili.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">11. Aggiornamenti</h2>
            <p className="mt-2">
              Questa informativa può essere aggiornata per riflettere
              modifiche ai servizi, alla normativa o alle modalità di
              trattamento. La versione pubblicata su questa pagina è quella
              applicabile.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
