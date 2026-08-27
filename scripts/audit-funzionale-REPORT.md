# AUDIT FUNZIONALE COMPLETO — LocalHub (FASE 4)

- **Data:** 2026-08-24
- **Ambiente:** server dev locale `http://localhost:3100` (stesso Supabase della produzione)
- **Account:** fixture ufficiali del progetto (admin.test / commerciante-a / customer-a) + sessione admin su negozio reale per la UI venditore
- **Metodo:** Playwright headless, 98 test funzionali end-to-end, raccolta errori console/HTTP/JS
- **Nessuna modifica a codice, dati, sicurezza, nessun pagamento reale, nessun commit/push/deploy**

---

## ROUTE

Inventario totale: **185 route** (79 pagine + 106 API).

| Categoria | Route |
| --- | --- |
| **Pubbliche** | `/` · `/negozi` · `/negozi?featured=1` · `/categorie` · `/categorie/[slug]` · `/negozio/[slug]` · `/prodotto/[slug]` · `/prodotto/[slug]/acquista(/ritiro,/spedizione)` · `/ricerca` · `/carrello` · `/checkout` · `/assistant` · `/ordini/recupera` · `/ordini/conferma/[id]` · `/logout-success` · `/ritorno-stripe` · `/test-editor` · 404 |
| **Autenticazione** | `/login` (cliente/merchant/admin) · `/recupero-password` · `/reset-password` · `/verifica-email` · `/admin` (ingresso amministratore) |
| **Cliente** | `/cliente` · `/cliente/profilo` · `/cliente/preferiti` · `/cliente/ordini` · `/cliente/ordini/[id]` · `/cliente/impostazioni` · `/cliente/segnalazioni` (+ legacy `/profilo` `/preferiti` `/ordini`) |
| **Venditore** | `/merchant` · `/merchant/nuovo` · `/merchant/[id]` · `/merchant/[id]/prodotti(/nuovo,/[pid],/ai)` · `/merchant/[id]/ordini(/[oid])` · `/merchant/[id]/incassi` · `/merchant/[id]/guadagni` · `/merchant/[id]/pagamenti` · `/merchant/[id]/impostazioni` · `/merchant/[id]/media` · `/merchant/[id]/edit` · `/merchant/[id]/payout` (→ redirect a guadagni) |
| **Amministratore** | `/amministratore` + 30 sottoroute (attivita, cestino, prodotti, categorie, negozi-in-evidenza, ordini, incassi, payout, utenti, template, impostazioni, eventi, offerte, segnalazioni, statistiche, scansioni, registro-attivita, assistente-ai, negozi/[id]…) |
| **API rilevanti** | 106 route (auth, cliente, merchant, amministratore, pagamenti/Stripe, webhook, ricerca, assistente) |
| **Speciali** | `/admin` (ingresso dedicato) · `/assistant` + pannello AI · `/test-editor` · `/ritorno-stripe` · `/logout-success` |

---

## FUNZIONALITÀ

**98 test eseguiti → 94 OK · 3 KO · 1 WARN**

| Sezione | Esito |
| --- | --- |
| Navigazione pubblica (header, footer, CTA, ricerca, meteo, assistente, categorie) | 19 OK |
| Autenticazione (3 ingressi, login valido/invalido, logout, /admin) | 15 OK |
| Area cliente (dashboard, profilo, preferiti, ordini, impostazioni) | 5 OK + 1 WARN |
| Area venditore (negozio reale via admin + flusso negozio cestinato) | 9 OK |
| Area amministratore (16 sezioni + sidebar + cestino) | 15 OK · 3 KO |
| Carrello (aggiunta, quantità, rimozione, badge, persistenza) | 5 OK |
| Flusso ordine (Home→negozio→prodotto→carrello→checkout pre-pagamento) | 2 OK |
| Permessi e sicurezza (14 test) | 14 OK |
| Responsive minimo (320/375/768/1280) | 4 OK |
| Regressione modifiche recenti | 8 OK |

---

## AUTENTICAZIONE

- **CLIENTE:** login valido → `/cliente` ✓ · login non valido → messaggio d'errore e permanenza su `/login` ✓ · accesso diretto ✓ · logout (drawer area + menu header) invalida la sessione ✓ · /admin → `/cliente` ✓
- **VENDITORE:** login valido → `/merchant` ✓ · accesso diretto ✓ · logout ✓ · /admin → `/merchant` ✓ · negozio non proprio/cestinato → negato ✓
- **AMMINISTRATORE:** login valido → `/amministratore` ✓ · accesso diretto ✓ · /admin → `/amministratore` ✓
- **"Accedi in alto":** il pulsante Accedi nell'header apre il menu con "Entra come Cliente" e "Entra come Venditore", entrambi funzionanti. **Il problema storico "Accedi in alto non funziona / Accedi in basso funziona" NON esiste più.** Il doppio "Accedi" sulla pagina di login è un unico submit reale (tab superiore = stesso form).

## NAVIGAZIONE

- Header: Home/Negozi/Categorie/Carrello → destinazioni corrette, nessun 404, nessun errore console ✓
- Logo → Home ✓ · Meteo (temperatura + Castrovillari + condizione) ✓ · Assistente AI apre il pannello ✓ · /assistant renderizza ✓
- Ricerca homepage → `/ricerca?q=` ✓ · CTA "Negozi in evidenza" ✓ · Card categoria ✓
- Footer: tutti i link rispondono (Home, Negozi, Categorie, In evidenza, login cliente/venditore, **Amministrazione → /login?area=admin** come da design) ✓
- **Link rotti: nessuno** tra i link reali della UI.

## CARRELLO / ORDINI

- Aggiunta prodotto → badge "1" ✓ · persistenza `localhub.carrello.v1` ✓ · quantità + → badge "2" ✓ · rimozione → carrello vuoto (badge sparito + storage azzerato) ✓
- Catena Home → /negozio/panificio-rossi → /prodotto/pane-casereccio-1-5-kg → carrello → **checkout con UI metodi di pagamento (carta/klarna/paypal/scalapay/bonifico) — fermato qui, nessun pagamento reale** ✓

## PERMESSI

Tutti i 14 test OK:
- Non autenticato: `/cliente`→`/login?area=cliente` · `/merchant`→`/login?area=merchant` · `/amministratore`→`/login?area=admin` ✓
- Cliente: route merchant e admin → pagina "ACCESSO NEGATO / Area non autorizzata" ✓ · /admin → propria area ✓
- Merchant: route admin e cliente → negate ✓
- **/admin non costituisce alcun bypass**: non autenticato→login admin; admin→pannello; merchant/cliente→propria area ✓
- Logout invalida realmente la sessione (dopo il logout le aree protette tornano al login) ✓
- API protette senza sessione → 401/403/405 (nessun 200 concesso) ✓

## ERRORI

| Tipo | Dettaglio | Classificazione |
| --- | --- | --- |
| **HTTP 500** | `GET /api/amministratore/payout?pagina=1` e `GET /api/merchant/stores/{id}/payout` → `column payout.created_at does not exist` | 🔴 ERRORE REALE |
| **HTTP 400** | 2 immagini prodotto (`_next/image` → storage Supabase `product-images/027b5b72…` e `eb113d40…`) — la sorgente stessa risponde 400 | 🟡 ERRORE REALE (dati) |
| Errori console JS | nessuno (nessun pageerror, nessun hydration error) | ✅ |
| 404 | solo `/amministratore/negozi` senza ID (route non esistente, nessun link la usa) | 🟢 NON BLOCCANTE |

## REGRESSIONI

Tutte OK: nav icona-sopra/testo-sotto (desktop+mobile) · Carrello in nav con badge · nessuna voce "Amministrazione" nell'header (accesso solo da `/admin` e footer) · `/admin` · meteo + previsione (testo reale "29° Castrovillari · Sereno") · restyling categorie (8 card in homepage) · header mobile 320px (logo+meteo+account in riga, dentro viewport) · login da header · Cestino raggiungibile dalla sidebar admin e funzionante.

---

## PROBLEMI TROVATI

### 🔴 CRITICO

**PRIORITÀ:** 🔴 CRITICO
**ROUTE:** `/amministratore/payout` · `GET /api/amministratore/payout` · `/merchant/[id]/guadagni` (sezione payout) · `GET /api/merchant/stores/{id}/payout`
**FUNZIONE:** Payout (admin e venditore)
**COMPORTAMENTO ATTUALE:** le API rispondono **500** `Lettura payout fallita: column payout.created_at does not exist`; la pagina admin Payout e la sezione payout di Guadagni non mostrano i dati. Il calcolo payout (`payout_calcola`) funziona, ma ogni LETTURA dello storico fallisce.
**COMPORTAMENTO ATTESO:** lista payout e riepilogo caricate correttamente.
**CAUSA PROBABILE:** la tabella `payout` (migrazione `20260906_payout.sql`) ha la colonna **`creato_at`**, ma il codice interroga **`created_at`** (disallineamento nome colonna).
**FILE/COMPONENTE RESPONSABILE:** `lib/amministratore/payout.ts` (righe ~97, ~142) · `lib/merchant/payout.ts` (righe ~102, ~150, ~180)
**RIPRODUCIBILE:** SÌ (100%)

### 🟡 MEDIO

**PRIORITÀ:** 🟡 MEDIO
**ROUTE:** `/amministratore/prodotti` (e pagina prodotto)
**FUNZIONE:** immagini prodotto
**COMPORTAMENTO ATTUALE:** 2 immagini restituiscono 400 (`_next/image` e sorgente Supabase storage): `product-images/027b5b72-177b-430e-b69b-b24f2212e616.jpeg` e `eb113d40-ca29-4860-9efe-edab69cd5efa.jpeg`
**COMPORTAMENTO ATTESO:** immagini visibili.
**CAUSA PROBABILE:** oggetti storage mancanti/corrotti referenziati nel DB (dato, non codice).
**FILE/COMPONENTE RESPONSABILE:** record prodotti (dati storage Supabase)
**RIPRODUCIBILE:** SÌ

### 🟢 BASSO

**PRIORITÀ:** 🟢 BASSO
**ROUTE:** area venditore (tutti i negozi)
**FUNZIONE:** negozi fixture QA
**COMPORTAMENTO ATTUALE:** i 4 negozi fixture QA ("Negozio QA Commerciante A/B/C/D") risultano **nel cestino** (soft-deleted, `deleted_at` = 2026-08-24 16:26 UTC): le pagine venditore mostrano correttamente l'accesso negato.
**COMPORTAMENTO ATTESO:** negozi fixture attivi per i test. Il comportamento di negazione è corretto; è lo stato dei dati di test a essere cambiato (verosimilmente un test manuale del flusso Cestino). Area venditore verificata con sessione admin su negozio reale (UI identica).
**CAUSA PROBABILE:** cancellazione (soft) dei negozi QA durante test precedenti.
**RIPRODUCIBILE:** SÌ (stato dati)

**PRIORITÀ:** 🟢 BASSO
**ROUTE:** `/merchant/[id]/prodotti` vs `/merchant/[id]/guadagni`
**FUNZIONE:** messaggi di negazione venditore
**COMPORTAMENTO ATTUALE:** stesso caso (negozio non proprio) mostra "Accesso non disponibile — negozio non collegato al tuo account" su prodotti e "Negozio non disponibile — non hai accesso ai guadagni" su guadagni.
**COMPORTAMENTO ATTESO:** messaggio coerente tra le pagine.
**CAUSA PROBABILE:** due empty-state diversi (layout vs pagina) non allineati.
**RIPRODUCIBILE:** SÌ

**PRIORITÀ:** 🟢 BASSO
**ROUTE:** `/amministratore/negozi` (senza ID)
**FUNZIONE:** — (nessun link la usa)
**COMPORTAMENTO ATTUALE:** 404 (nessun `page.tsx` per la lista; i negozi si gestiscono da `/amministratore/attivita` e dalla dashboard).
**COMPORTAMENTO ATTESO:** nessun link punta a questa route: non è un bug utente, solo una route inesistente (eventuale redirect utile).

### WARN (non bloccante)

- Dettaglio ordine cliente: il profilo di test `customer-a` non ha ordini → pagina ordini vuota, dettaglio non verificabile con dati reali.

---

## RIEPILOGO

| Metrica | Valore |
| --- | --- |
| Route totali analizzate | **185** (79 pagine + 106 API) |
| Test totali eseguiti | **98** |
| Test OK | **94** |
| Test falliti (KO) | **3** (tutti riconducibili a 2 cause: 1 bug payout + 2 immagini rotte) |
| Test WARN | **1** (dettaglio ordine senza dati) |
| Problemi critici 🔴 | **1** (payout 500 admin+venditore) |
| Problemi alti 🟠 | **0** |
| Problemi medi 🟡 | **1** (2 immagini rotte) |
| Problemi bassi 🟢 | **3** (stato negozi QA, incoerenza messaggi, route inesistente) |
| Errori console/JS/hydration | **0** |
| Aree non testabili | Pagamenti reali (Stripe live) — vietati dal mandato; ordine oltre il checkout — fermato al punto sicuro; area venditore con negozio fixture attivo — negozi QA nel cestino (testata via admin su negozio reale, stessa UI) |

**Nota di sicurezza:** l'audit conferma che permessi, `/admin`, logout e API protette funzionano come progettato. Nessun bypass trovato.
