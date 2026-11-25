import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Cookie e tecnologie di archiviazione locale utilizzati da Radici Calabria.",
  alternates: {
    canonical: `${getSiteUrl()}/cookie`,
  },
};

const cookieTecnici = [
  {
    nome: "Cookie di sessione Supabase",
    finalita: "Mantengono l'accesso autenticato dell'utente registrato (consumatori, imprese, amministratori).",
    durata: "Secondo la durata della sessione di autenticazione.",
  },
  {
    nome: "lh_area",
    finalita: "Ricorda l'area di accesso selezionata (consumatori, imprese o amministrazione) per instradare correttamente la navigazione.",
    durata: "Per la durata della sessione o secondo le impostazioni del cookie.",
  },
  {
    nome: "lh_guest",
    finalita: "Identifica il carrello e le operazioni di un utente non registrato, senza richiedere un account.",
    durata: "30 giorni.",
  },
  {
    nome: "Cookie di accesso all'ordine",
    finalita: "Consente di consultare lo stato di un ordine senza necessità di login, limitatamente all'ordine interessato.",
    durata: "Secondo la durata dell'ordine.",
  },
];

const storageLocale = [
  {
    nome: "lh_lang",
    tipo: "Cookie e localStorage",
    finalita: "Memorizza la lingua scelta dall'utente per l'interfaccia.",
    durata: "1 anno.",
  },
  {
    nome: "incitta_cookie_notice_v1",
    tipo: "cookie",
    finalita: "Registra che l'utente ha preso visione dell'informativa cookie, per non riproporla a ogni visita.",
    durata: "1 anno.",
  },
  {
    nome: "localhub.carrello.v1",
    tipo: "localStorage",
    finalita: "Conserva il contenuto del carrello sul dispositivo.",
    durata: "Fino alla rimozione da parte dell'utente o alla svuotatura del carrello.",
  },
  {
    nome: "lh_ricordami_credenziali",
    tipo: "localStorage",
    finalita: "Solo se l'utente seleziona \"Ricordami\" al login: ricompila email e password nel form di accesso. Il dato non viene inviato al database e viene cancellato quando l'utente accede senza \"Ricordami\" o lo disattiva.",
    durata: "Fino alla cancellazione da parte dell'utente.",
  },
  {
    nome: "radici-cronologia-interna",
    tipo: "sessionStorage",
    finalita: "Consente al pulsante \"indietro\" di tornare correttamente alla pagina precedente all'interno del sito.",
    durata: "Fino alla chiusura della scheda del browser.",
  },
  {
    nome: "prodotti_ai_immagine",
    tipo: "sessionStorage",
    finalita: "Conserva temporaneamente l'immagine caricata dall'impresa nello strumento di inserimento prodotto assistito da IA.",
    durata: "Fino alla chiusura della scheda del browser.",
  },
];

const sezioni = [
  {
    titolo: "1. Cosa sono i cookie e lo storage locale",
    contenuto: (
      <p>
        I cookie sono piccoli file che un sito memorizza sul dispositivo dell'utente. Il
        localStorage e il sessionStorage sono aree di memoria del browser con funzione simile. Questa
        pagina descrive quelli effettivamente utilizzati da Radici Calabria.
      </p>
    ),
  },
  {
    titolo: "2. Cookie tecnici e di sessione",
    contenuto: (
      <>
        <p>
          Sono necessari al funzionamento della piattaforma e non richiedono consenso. Radici Calabria
          non utilizza cookie di profilazione né cookie pubblicitari.
        </p>
        <ul>
          {cookieTecnici.map((c) => (
            <li key={c.nome}>
              <strong>{c.nome}</strong>: {c.finalita} Durata: {c.durata}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    titolo: "3. Preferenze e storage locale",
    contenuto: (
      <>
        <p>
          I seguenti elementi sono salvati nel browser per le funzioni indicate. Alcuni sono tecnici;
          altri dipendono da una scelta esplicita dell'utente.
        </p>
        <ul>
          {storageLocale.map((s) => (
            <li key={s.nome}>
              <strong>{s.nome}</strong> ({s.tipo}): {s.finalita} Durata: {s.durata}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    titolo: "4. Cookie analitici, di profilazione e di marketing",
    contenuto: (
      <p>
        Al momento Radici Calabria non utilizza cookie analitici di terze parti, strumenti di
        profilazione o cookie di marketing. Se in futuro questi strumenti venissero introdotti, questa
        Cookie Policy sarà aggiornata e, ove richiesto, verrà raccolto il consenso preventivo.
      </p>
    ),
  },
  {
    titolo: "5. Fornitori tecnici",
    contenuto: (
      <p>
        Alcuni servizi tecnici collegati alla piattaforma agiscono come fornitori e possono trattare
        dati tecnici necessari all'erogazione del servizio: Supabase (autenticazione e database),
        Vercel (hosting), Stripe (pagamenti, quando attivati dall'utente), Groq (assistente Pino) e
        Resend (email transazionali). Per il dettaglio consulta la Privacy Policy.
      </p>
    ),
  },
  {
    titolo: "6. Messaggi email",
    contenuto: (
      <p>
        Le email inviate dalla piattaforma (conferme, aggiornamenti ordine, reimpostazione password)
        non contengono tracking pixel né altri strumenti di monitoraggio dell'apertura. Radici Calabria
        non utilizza pixel di tracciamento nelle comunicazioni e-mail, in conformità alle Linee guida
        del Garante (Provv. n. 284 del 17 aprile 2026).
      </p>
    ),
  },
  {
    titolo: "7. Come gestire cookie e storage",
    contenuto: (
      <p>
        L'utente può eliminare o bloccare cookie e dati locali dalle impostazioni del proprio browser.
        La disattivazione dei cookie tecnici può impedire l'accesso all'area riservata, il carrello e
        il checkout. Le preferenze relative ai dati di "Ricordami" possono essere eliminate svuotando i
        dati del sito nel browser.
      </p>
    ),
  },
  {
    titolo: "8. Aggiornamenti e contatti",
    contenuto: (
      <p>
        La presente Cookie Policy può essere aggiornata in caso di modifiche tecniche o normative.
        Per domande sui cookie è possibile scrivere tramite il modulo della pagina{" "}
        <Link href="/contatti" className="font-semibold text-blue-700 underline">
          Contatti
        </Link>
        .
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
              Questa Cookie Policy integra la Privacy Policy di Progetto Radici Calabria — Piattaforma
              digitale di valorizzazione delle filiere agroalimentari e dei territori della Calabria ·
              Castrovillari (CS).
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
