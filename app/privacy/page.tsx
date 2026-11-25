"use client";

import Link from "next/link";

const fornitori = [
  {
    nome: "Supabase",
    ruolo: "Database, autenticazione e archiviazione dei dati dell'account, degli ordini e dei contenuti della piattaforma.",
  },
  {
    nome: "Vercel",
    ruolo: "Hosting e distribuzione del sito, con registrazione dei log tecnici necessari al funzionamento e alla sicurezza.",
  },
  {
    nome: "Stripe",
    ruolo: "Elaborazione dei pagamenti e, per le imprese, gestione dei pagamenti verso i produttori (Stripe Connect). Stripe tratta i dati di pagamento secondo le proprie condizioni.",
  },
  {
    nome: "Groq",
    ruolo: "Esecuzione dei modelli linguistici che generano le risposte dell'assistente Pino. Il testo delle domande inviate a Pino viene elaborato da Groq.",
  },
  {
    nome: "Resend",
    ruolo: "Invio delle email transazionali (conferme d'ordine, aggiornamenti, registrazione, reimpostazione della password).",
  },
  {
    nome: "Google (Gemini) e OpenRouter",
    ruolo: "Funzioni di IA per l'analisi di testi e immagini caricati dalle imprese nello strumento di inserimento prodotto e per alcune funzioni di supporto interne alla piattaforma.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            ← Torna a Radici Calabria
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Informativa Privacy
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Ultimo aggiornamento: novembre 2026
        </p>

        <div className="mt-8 space-y-8 text-[15px] leading-7 text-slate-700">
          <section>
            <h2 className="text-xl font-bold text-slate-900">1. Titolare del trattamento</h2>
            <p className="mt-2">
              Il titolare del trattamento è il Progetto Radici Calabria — Piattaforma digitale di
              valorizzazione delle filiere agroalimentari e dei territori della Calabria · Castrovillari
              (CS). Radici Calabria è una piattaforma informativa e di connessione territoriale. Per
              qualsiasi richiesta relativa ai tuoi dati personali utilizza il modulo della pagina{" "}
              <Link href="/contatti" className="font-semibold text-blue-700 underline">
                Contatti
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">2. Dati trattati</h2>
            <p className="mt-2">
              A seconda dei servizi utilizzati, trattiamo: dati identificativi e di contatto (nome,
              email, telefono se forniti); credenziali di accesso; dati dell'account e delle imprese
              registrate; dati degli ordini e dei pagamenti; contenuti inviati alla piattaforma
              (recensioni, segnalazioni, testi e immagini caricati); le domande rivolte all'assistente
              Pino; dati tecnici necessari al funzionamento e alla sicurezza (indirizzo IP, log di
              accesso, informazioni sul browser).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">3. Registrazione e autenticazione</h2>
            <p className="mt-2">
              L'account può essere creato con email e password. Quando l'utente sceglie l'accesso con
              Google o Apple, il provider comunica a Radici Calabria i dati necessari a identificare
              l'account, nei limiti delle autorizzazioni concesse dall'utente. La funzione "Ricordami"
              nel form di accesso memorizza email e password solo nel browser dell'utente, non sul
              server; si veda la Cookie Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">4. Finalità e basi giuridiche</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Creare e gestire l'account, fornire le funzioni richieste e gestire ordini e pagamenti: esecuzione del contratto o di misure precontrattuali (art. 6.1.b GDPR).</li>
              <li>Inviare comunicazioni di servizio (conferme, aggiornamenti d'ordine, reimpostazione password): esecuzione del contratto.</li>
              <li>Sicurezza, prevenzione di abusi e accessi non autorizzati: legittimo interesse (art. 6.1.f GDPR).</li>
              <li>Adempiere agli obblighi di legge, anche fiscali e in materia di segnalazioni: obbligo legale (art. 6.1.c GDPR).</li>
              <li>Trattamenti non necessari al servizio, se previsti: consenso dell'interessato (art. 6.1.a GDPR), revocabile in ogni momento.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">5. Fornitori e destinatari dei dati</h2>
            <p className="mt-2">
              Per far funzionare la piattaforma utilizziamo i seguenti fornitori, che trattano i dati
              in qualità di responsabili del trattamento o, dove previsto, come titolari autonomi:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {fornitori.map((f) => (
                <li key={f.nome}>
                  <strong>{f.nome}</strong>: {f.ruolo}
                </li>
              ))}
            </ul>
            <p className="mt-3">
              Non utilizziamo strumenti di analisi del traffico o di profilazione pubblicitaria di
              terze parti. Non inviamo pixel di tracciamento nelle email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">6. Assistente Pino e intelligenza artificiale</h2>
            <p className="mt-2">
              Pino è un sistema di intelligenza artificiale generativa basato su modelli linguistici
              (LLM) eseguiti tramite Groq. Pino elabora risposte automatiche a partire dai contenuti
              pubblicati sul portale; le risposte non sostituiscono una consulenza professionale e
              Pino non è un operatore umano. Le domande inviate a Pino possono essere elaborate dal
              fornitore del modello per generare la risposta. Non inserire dati sensibili o personali
              di terzi nelle domande.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">7. Conservazione dei dati</h2>
            <p className="mt-2">
              I dati dell'account sono conservati per la durata del rapporto e per il tempo successivo
              necessario agli obblighi di legge o alla tutela dei diritti. I dati degli ordini sono
              conservati per il periodo richiesto dagli adempimenti fiscali e contabili. I dati tecnici
              di sicurezza sono conservati per il tempo strettamente necessario.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">8. Trasferimenti extra UE</h2>
            <p className="mt-2">
              Alcuni fornitori possono trattare dati al di fuori dell'Unione europea. In tali casi il
              trasferimento avviene sulla base delle garanzie previste dal GDPR, come le clausole
              contrattuali standard o le decisioni di adeguatezza.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">9. Diritti dell'interessato</h2>
            <p className="mt-2">
              Puoi chiedere l'accesso, la rettifica, la cancellazione, la limitazione, la portabilità
              dei dati e opporti al trattamento, e revocare il consenso dove previsto. Puoi esercitare
              questi diritti tramite la pagina{" "}
              <Link href="/contatti" className="font-semibold text-blue-700 underline">
                Contatti
              </Link>
              . Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">10. Cookie e tecnologie simili</h2>
            <p className="mt-2">
              Per l'elenco dettagliato di cookie e spazi di archiviazione locale utilizzati, consulta la{" "}
              <Link href="/cookie" className="font-semibold text-blue-700 underline">
                Cookie Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">11. Modifiche alla informativa</h2>
            <p className="mt-2">
              La presente informativa può essere aggiornata. La versione pubblicata indica la data
              dell'ultimo aggiornamento.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
