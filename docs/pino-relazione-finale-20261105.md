# Pino — Relazione conclusiva (chiusura roadmap RAG + Agentic AI)

Branch: `fix/pino-core-v2-intent-normalization-20261101`
Commit di partenza: `a711922d47b3e246952ecf5a39dc4e2f6e1f9942`
Data: 5 novembre 2026
Stato: candidato finale, **nessun merge su `main`, nessuna promozione a Production**.

> Nota di metodo: il documento originale del piano non è presente nel repository
> (nessun file di roadmap è tracciato). Le fasi sotto sono quindi ricostruite
> dalle marche presenti nel codice, nei test e nei messaggi di commit, e il loro
> stato è dichiarato solo dove esiste evidenza eseguibile.

---

## 1. Roadmap e stato di ogni fase

| Fase | Contenuto | Stato |
| --- | --- | --- |
| P0.1 | Budget esplicito pari a zero (non "budget assente") | Completata |
| P1.1 | Contratto centrale dei tool + Function Calling nativo Gemini | Completata; percorso nativo **sperimentale e spento** |
| P1.2 | Metadati prodotto e pertinenza del soggetto | Completata |
| P1.3 / 1.3.2 / 1.3.4 / 1.3.5 | Pertinenza, benchmark ripulito, pertinenza su dati reali, unità di misura | Completata |
| S1 / S1-A | Contratto al confine: allowlist, validazione parametri, deduplica, limite 3 invocazioni | Completata |
| S2 | Budget vincolante su ogni invocazione di catalogo | Completata |
| S3 | Contratto di comprensione (`PinoUnderstanding`) | Completata |
| S4.1 – S4.8 | Comprensione unica, attributi, filtri, servizi, esclusioni, servizi indiretti, luoghi/catalogo | Completata |
| S5.1 – S5.3 | Coerenza strumenti, attributi dal contesto, affidabilità | Completata |
| S6.1 / S6.2 | Correzioni attributi/forma canonica, esclusioni brevi | Completata |
| M5-A / M5-B | Selezione vuota non utilizzabile; parametri forniti e svuotati | Completata |
| M6-A / M6-B / M6-B1 | Isolamento errori tool, timeout effettivi (20 s), fallback `searchAll` con scadenza | Completata |
| M6-C1 / C1-1 / C2 / C3 | Segnalazione errori su prodotti, categorie, offerte, eventi, farmacie | Completata |
| M6-D1 | Meteo come ramo deterministico e classificazione delle fonti | Completata |
| F2 | Shadow Tier 0 (osservatore post-risposta) | Completata; **spenta per default** |
| Fase 2 | Collegamento della Shadow alla route con `after()` | Completata |
| Fase 3 | Memoria semantica, rate limiter, modalità di collaudo locale | Completata |
| Core V2 — milestone 1-2 | Corpus etichettato da 165 richieste + misura delle sole guardie deterministiche | Completata |
| Core V2 — milestone 3-6 | Adattatore full-pipeline, run live della AI v2, confronto, fusione dello stato conversazionale | **Non completata**: richiede chiamate Gemini reali e un adattatore read-only del pipeline completo; lasciata dichiaratamente fuori scope |

Nessuna nuova sottofase è stata aperta. Il lavoro di questo ciclo è: verifica
dello stato, chiusura dei buchi di verifica, build e relazione.

---

## 2. Architettura Pino effettivamente realizzata

Pipeline reale di una richiesta (`app/api/assistente/route.ts` → `lib/assistente/index.ts`):

1. **Normalizzazione della conversazione** — solo ruoli validi, testo non vuoto,
   ultimi 12 messaggi. Il messaggio corrente è distinto dalla cronologia.
2. **Stato conversazionale** — `costruisciStatoConversazionale` separa richiesta
   corrente e soggetto ereditato, una sola volta per richiesta.
3. **Comprensione unica** — `analizzaComprensionePino` produce lingua, soggetto,
   attributi, esclusioni e limiti di prezzo.
4. **Guardie deterministiche** — saluti, identità, preferenza linguistica, meteo,
   farmacie, eventi, cinema, attrazioni, richieste aggregate. Hanno precedenza
   sui rami generici (un toponimo non basta a dirottare su "Attrazioni").
5. **Piano semantico** — planner Gemini entro un budget esplicito di 2 chiamate,
   con piano locale deterministico come fallback (chiave assente, timeout, quota,
   JSON non valido).
6. **Selezione degli strumenti** — percorso JSON legacy (produzione) o percorso
   nativo P1.1 (sperimentale, spento). Contratto unico in `function-calling.ts`:
   nome, descrizione, JSON Schema, chiavi ammesse, strumenti esposti/interni.
7. **Validazione prima del dispatch** — allowlist dei nomi, `validaToolParams`,
   scarto dei parametri svuotati (M5-B), budget vincolante che sovrascrive il
   modello, attributi trasferiti alle sole invocazioni di catalogo, massimo 3
   invocazioni deduplicate.
8. **Recupero dati reali InCittà** — `tools.ts` su Supabase: negozi, prodotti,
   offerte, eventi, categorie, farmacie, meteo. Nessun dato inventato: prezzi,
   disponibilità e servizi sono solo quelli restituiti dal catalogo, e ciò che il
   catalogo non dichiara viene detto non verificabile.
9. **Esecuzione isolata** — `Promise.allSettled` + scadenza per invocazione
   (20 s). Ogni esito trasporta la propria invocazione; gli stati `ok`, `vuoto`,
   `errore`, `timeout` restano distinti.
10. **Merge e risposta** — deduplica per id, risultati validi conservati anche con
    errori parziali, nota di indisponibilità quando una fonte fallisce e nessun
    risultato è disponibile (mai "non ho trovato nulla" su catalogo non
    dimostrabile). Risposta finale LLM con fallback deterministico.
11. **Osservazione** — Shadow Tier 0 eseguita dopo la risposta con `after()`:
    sola lettura, nessuna chiamata a Gemini/Supabase/`fetch`, nessun testo utente
    nei log.

Italiano e inglese: lingua rilevata per messaggio, non per conversazione; i
messaggi deterministici sono localizzati.

---

## 3. File modificati in questo ciclo

Modificati:
- `package.json` — aggiunta `test:pino:spec`, `test:pino` completo
- `tests/pino-s4-1-integration.spec.ts`, `tests/pino-s1-tool-contracts.spec.ts`,
  `tests/pino-s4-3-filtri-attributi.spec.ts`, `tests/pino-s4-8-luoghi-catalogo.spec.ts`,
  `tests/pino-semantic-constraints.spec.ts`, `tests/pino-domanda-aggregata.spec.ts`,
  `tests/pino-core-v2.test.mjs`, `tests/pino-core-v2-ai-planner.test.mjs`
- `lib/assistente/index.ts`, `lib/assistente/semantica.ts`, `lib/assistente/tools.ts`,
  `lib/assistente/prompt.ts`, `lib/assistente/memoria.ts`, `lib/assistente/budget-gemini.ts`
- `lib/assistente/core-v2/request-planner.ts`, `lib/assistente/core-v2/ai-request-planner.ts`,
  `lib/assistente/core-v2/README.md`
- `app/api/assistente/route.ts`, `lib/rate-limiter.ts`
- `scripts/pino-core-v2-live-benchmark.mjs`

Nuovi:
- `lib/assistente/function-calling.ts` — contratto centrale dei tool
- `lib/ai/gemini-function-calling.ts` — provider nativo (sperimentale)
- `lib/assistente/modalita-test.ts` — interruttore di collaudo locale fail-closed
- `lib/assistente/shadow/tier0.ts`, `lib/assistente/shadow/integrazione.ts`
- `playwright.pino.config.ts` — config delle suite Pino offline
- `docs/pino-relazione-finale-20261105.md` — questa relazione

Non toccati: frontend, componenti, pagine, database e schema, Stripe e pagamenti,
account, consegne, `.env.local`, immagini in `screenshots/`.

---

## 4. Test eseguiti e risultati numerici

Eseguiti realmente in questo ciclo, in locale:

| Comando | Esito |
| --- | --- |
| `npm run test:pino` | **231 test, 231 pass, 0 fail** |
| `npm run test:pino:spec` (nuovo, 38 suite offline) | **675 test, 675 pass, 0 fail** |
| `npx tsc --noEmit` | exit 0, nessun errore |
| `git diff --check` | exit 0, nessun conflitto di whitespace |
| `npm run build` (Next.js, con `prebuild` = `test:pino`) | **exit 0**, build di produzione completata |

Totale test Pino eseguiti e verdi: **906**.

I due comandi restano separati di proposito: `test:pino` gira sul runner Node
(senza browser) ed è quello richiamato da `prebuild`, quindi la build non
dipende dai browser di Playwright. `test:pino:spec` usa Playwright solo come
harness: le suite non aprono pagine e non richiedono `playwright install`.

**Test simulati e test reali.** Nessuna chiamata a Gemini è stata effettuata in
questo ciclo: senza `GEMINI_API_KEY` nel processo di test il planner cade sul
percorso locale e i log mostrano `planner non disponibile, fallback locale`.
Tutti i test sopra sono quindi **simulati/offline** (provider iniettato o assente,
Supabase sostituito dal client finto di `tests/support/hook-pino.mjs`, `fetch`
disattivato). Nessuna quota consumata, nessun limite gratuito a rischio.

Non eseguiti (motivo nella sezione 6):
- `npm run benchmark:pino:live` — richiede `PINO_RUN_LIVE_BENCHMARK=1` e chiamate
  Gemini reali;
- `tests/pino-widget.spec.ts` e `npm run test:e2e` — richiedono un ambiente
  avviato/browser e navigano l'app reale.

---

## 5. Funzionalità verificate

- Orchestrazione coerente degli intenti: meteo, farmacie, eventi e cinema non
  vengono dirottati sul ramo Attrazioni da un toponimo; nomi del catalogo e
  richieste di visita restano nella guida.
- Separazione messaggio corrente / cronologia: follow-up brevi ereditano il
  soggetto senza confondere la richiesta corrente.
- Strumenti tipizzati e parametri validati: nomi fuori allowlist rifiutati prima
  del dispatch, parametri svuotati scartati, massimo 3 invocazioni deduplicate.
- Ricerca su dati reali InCittà: nessun risultato costruito lato Pino.
- Risultati vuoti, errori e timeout distinti; risultati validi conservati;
  indisponibilità dichiarata invece di catalogo vuoto.
- Fallback deterministici: piano locale, `searchAll` con scadenza, risposte
  localizzate per meteo, farmacie, servizi, attributi e fonti non disponibili.
- Italiano e inglese, anche con cambio di lingua per singolo messaggio.
- Nessuna invenzione di negozi, prodotti, prezzi o disponibilità: prezzo,
  durata e attributi mancanti sono dichiarati non indicati.
- Shadow Tier 0: non altera la risposta, non registra testo utente, non può
  chiamare Gemini o Supabase.

---

## 6. Imperfezioni note, limiti residui e componenti non attivati

Imperfezioni e limiti:
- Le risposte generate dal modello in produzione non sono state misurate in
  questo ciclo: manca una run live controllata (costo/quota) e manca un
  adattatore read-only del pipeline completo. Il punteggio delle guardie
  deterministiche **non** è un punteggio del Pino di produzione.
- Il corpus etichettato da 165 richieste non contiene gold label per soggetto,
  attributi e query normalizzata: quelle metriche non sono dichiarabili.
- Il wrapper Gemini non espone il token usage: nessuna stima di costo.
- Il timeout di 20 s per invocazione smette di attendere la promessa ma non
  annulla la query PostgREST (nessun `AbortSignal` disponibile): la richiesta
  resta in volo lato DB.
- `pino-widget.spec.ts` verifica il widget trascinabile: è un test d'interfaccia
  e resta fuori dalle suite offline.

Componenti non attivati, con motivazione:
- **Function Calling nativo (P1.1)** — sperimentale, spento: il percorso JSON in
  produzione è verificato; il nativo si attiva solo se invocato esplicitamente.
- **Core V2 `ai-request-planner.ts`** — sperimentale, non importato dal runtime;
  richiede una run live costosa per essere valutato.
- **`product-evidence-ranker.ts`, `production-intent-snapshot.ts`** — solo
  test/sperimentali, non collegati al runtime.
- **Shadow Tier 0** — spenta per default, si accende solo con
  `PINO_SHADOW_MODE=on`; non modifica alcuna risposta.
- **Modalità di collaudo (`PINO_TEST_MODE=1`)** — negata su qualsiasi runtime
  Vercel e con `NODE_ENV=production`; serve solo al collaudo locale.

---

## 7. Stato Git e rilascio

- Branch di lavoro: `fix/pino-core-v2-intent-normalization-20261101`.
- Commit di partenza: `a711922d47b3e246952ecf5a39dc4e2f6e1f9942`.
- `main` e Production non sono state toccate; nessun merge, nessuna promozione.
- Nel commit del candidato sono inclusi solo file Pino. Restano fuori, come da
  vincolo, le immagini modificate in `screenshots/` e tutte le directory di
  backup locali (`.backup-*`, `backups/`).
- La Preview Vercel va creata dal branch; il deployment di Production resta
  invariato.

**Criterio di chiusura:** implementazione coerente (sì), suite integrata verde
(231 + 675 = 906 test), build verificata (sì), Preview da creare dal branch,
relazione tecnica (questo documento). Il lavoro è concluso; non vengono riaperti
cicli di perfezionamento su singole risposte.
