# InCittà

## Cos'è

InCittà è una piattaforma e-commerce locale (CMS) che mette in contatto negozi di prossimità e clienti: i negozi gestiscono vetrina, prodotti, orari, prenotazioni e pagamenti; i clienti cercano negozi e prodotti, acquistano online (carta, Klarna, PayPal, Scalapay) oppure ritirano in negozio.

Il progetto include anche un'area amministratore per la gestione della piattaforma e un assistente AI per i clienti.

## Stack

- **Next.js** (App Router) — framework
- **React** — UI
- **TypeScript** — linguaggio
- **Supabase** — database PostgreSQL, autenticazione e storage
- **Stripe** (incl. Stripe Connect) — pagamenti online e collegamento conti negozi
- **Resend** — email transazionali
- **Gemini / Cloudflare Workers AI / OpenRouter / Groq** — AI (riconoscimento prodotti, assistente, trascrizione audio)
- **ntfy + WhatsApp (Meta Cloud API)** — notifiche ordini e reclami

## Prerequisiti

- Node.js (versione compatibile con il `package.json`)
- Un progetto Supabase (URL + anon key + service role key)
- Account Resend per le email
- Chiavi dei provider che si intende usare (Stripe, AI, ecc.)

## Configurazione locale

Copia il file di esempio e inserisci i valori reali **solo** localmente:

```bash
cp .env.example .env.local
```

I secret reali (token, chiavi, password) non devono mai essere committati: vanno inseriti nel `.env.local` oppure nell'ambiente di deploy (es. Vercel). Il file `.env.example` contiene solo placeholder.

## Avvio

```bash
npm install
npm run dev
```

L'app è disponibile su `http://localhost:3000`.

## Struttura principale

- `app/` — route Next.js (pagine pubbliche, aree cliente/merchant/amministratore, API route)
- `components/` — componenti React riutilizzabili
- `lib/` — logica applicativa lato server (supabase, pagamenti, notifiche, AI, ricerca)
- `supabase/` — migration SQL e configurazione locale
- `scripts/` — script di utilità, fixture e test manuali

## Documentazione

- [ARCHITETTURA-NEGOZI.md](./ARCHITETTURA-NEGOZI.md) — architettura database e CMS dei negozi