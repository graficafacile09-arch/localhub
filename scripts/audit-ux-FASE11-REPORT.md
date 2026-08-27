# 📋 AUDIT UX/UI PROFONDO — LOCALHUB (FASE 11 POST-10A/10B/10C)

*Solo audit. Nessuna modifica. Baseline verificata: HEAD `d68571b` (10C) · `6d19599` (10B) · `8798fca` (10A), working tree pulito.*
*61 screenshot reali (27 base + 34 deep) in `scripts/__fase11-shots/`, misurazioni DOM sistematiche, Playwright con account fixture.*

**Risultato complessivo: 84+ controlli · 0 errori console · 0 HTTP 4xx/5xx · 0 overflow orizzontale.**

---

## A. GIUDIZIO GENERALE

L'app è usabile, coerente nel linguaggio visivo (blu brand / giallo CTA, radius 12–16px, body 16px) e le Fasi 10A/10B/10C hanno **risolto i problemi strutturali principali** (sidebar admin piatta, nav merchant piatta, bottom nav senza Guadagni, scala titoli pubblica). Non emerge alcun problema **P1** (nulla ostacola significativamente l'uso). Restano **incoerenze di scala secondarie** (7 H1 fuori scala 18–24px in pagine non coperte dalla 10C) e una **pagina pubblica con gerarchia debole** (`/ricerca` senza H1). Il rischio residuo più reale è la **disomogeneità delle CTA admin** (36–48px) e la **densità informativa** di alcune pagine admin.

---

## B. COSA È MIGLIORATO CON 10A/10B/10C (verificato su schermo reale)

| Intervento | Verifica Fase 11 | Esito |
| --- | --- | --- |
| **10A** Sidebar admin a gruppi (7 gruppi, 20 voci) | gruppi chiusi di default, gruppo attivo auto-aperto e non chiudibile, voce attiva evidenziata, Cestino in **Recupero**, Piattaforma/Strumenti separati, **Negozi gestiti** e **Torna al sito** separati, 20/20 href invariati, drawer mobile funzionante | ✅ |
| **10B** Nav merchant | principali separati da **Strumenti**, Duplica = azione secondaria (button), bottom nav **Negozio/Prodotti/Ordini/Guadagni/AI**, **Guadagni attivo** su /guadagni /incassi /payout, Home dalla top bar, titolo "Area Venditore" | ✅ |
| **10C** Scala titoli + pulsanti | H1 pubblici e aree riservate principali = **30px**, hero 48px, checkout 30px, "Esplora i negozi" = **40px** ovunque | ✅ |

Densità sidebar admin: da lista piatta a **20 link organizzati in 7 gruppi** — il problema della piattezza è risolto.

---

## C. PROBLEMI RESIDUI (P1/P2/P3)

Nessun **P1**.

### 🟠 P2
| Area | Pagina/Componente | Problema | Evidenza | Perché è un problema |
| --- | --- | --- | --- | --- |
| Admin | **Template** — `TemplateManagerPage.tsx:143` | H1 = **18px** (`text-lg`), più piccolo di un H2 | misurato 18px, unico H1 a 18px dell'app | La voce di menu "Template" porta a una pagina il cui titolo non sembra un titolo di pagina |
| Pubblico | **/ricerca** — `app/ricerca/page.tsx` | **Nessun H1**; intestazioni sezione risultato a **12px** (`text-xs`) | 0 heading h1/h2/h3 nel DOM con e senza query | L'utente non capisce di essere sulla pagina risultati di ricerca; i titoli di sezione sono minuscoli |

### 🟡 P3 (coerenza scala titoli — pagine non coperte dalla 10C)
| Area | Pagina/Componente | H1 | File |
| --- | --- | --- | --- |
| Admin | Cestino | 24px | `components/amministratore/CestinoModule.tsx:127` |
| Admin | Scansioni AI | 24px | `app/(amministratore)/amministratore/scansioni/page.tsx:110` |
| Admin | Dettaglio Payout | 24px su mobile (30px desktop, `md:text-3xl`) | `components/amministratore/payout/PayoutAdminDetailClient.tsx:168` |
| Cliente | Preferiti | 24px | `components/cliente/preferiti/PreferitiModule.tsx:162` |
| Cliente | Segnalazioni | 24px su mobile | `components/cliente/segnalazioni/SegnalazioniClienteModule.tsx:67` |
| Cliente | Ordini | 24px su mobile (30px desktop) | `app/(cliente)/cliente/ordini/page.tsx:73` |

### 🟡 P3 (coerenza CTA e input — misurata, nuova evidenza)
- **btn-cta admin incoerenti (36–48px)** per azioni equivalenti "Crea/Nuovo": negozi 48px · categorie 48px · utenti 44px · impostazioni 44px · offerte 40px · eventi 40px · cestino 38px · template 36px · (segnalazioni cliente 48px). La base `btn-cta` è 40px; le varianti `py-3`/`py-2.5`/`px-4 py-2.5` la spostano.
- **Input incoerenti**: 40px (cliente/profilo/ricerca) vs 44px (segnalazioni) vs 46px (admin negozi/categorie/evidenza).

---

## D. PROBLEMI NUOVI (emersi in questa audit, non nel report Fase 10)

1. **/ricerca senza H1 e intestazioni a 12px** — P2 (non rilevato prima: la pagina era stata testata solo per overflow).
2. **Incoerenza altezze btn-cta admin 36–48px** — P3 (misurata sistematicamente per la prima volta; la 10C aveva uniformato solo il caso "Esplora i negozi").
3. **Input admin 46px vs cliente 40px** — P3.
4. **H1 "Scansioni AI" 24px** — P3 (non incluso nell'elenco precedente).

---

## E. PROBLEMI DA NON TOCCARE ⚪ (verificati, funzionano bene)

- **Sidebar admin 10A** (gruppi/accordion/negozi gestiti/torna al sito) — risolve la densità; NON modificare.
- **Nav merchant 10B** (Strumenti, bottom nav con Guadagni, Home in top bar) — NON modificare.
- **Scala titoli 10C** (H1 pubblici 30px, hero 48px, Esplora 40px) — NON modificare.
- **Header pubblico** (logo+meteo+Account), homepage, negozi, categorie, carrello, checkout, login.
- **Pattern etichette sezione 12px uppercase** (`text-xs uppercase`) su admin/negozio — è un pattern voluto e coerente.
- **Sidebar cliente** (5 voci + descrizione) — il modello migliore dell'app.
- **Empty state merchant** "Crea il tuo primo negozio" e gestione negozio non posseduto ("Non hai accesso ai guadagni…" senza errori) — corretti.

---

## F. ANALISI SEPARATA

### PUBBLICO
- Home: hero 48px dominante, ricerca, categorie, negozi, meteo, footer — coerenti, nessun problema.
- /negozi, /categorie, /carrello, /login, /prodotto, checkout: H1 30px ✅.
- **/ricerca: gerarchia debole (P2, §C)** — unico punto debole del pubblico.
- Ingresso Amministrazione solo nel footer: intenzionale (sicurezza), non toccare.

### CLIENTE
- Dashboard 30px, Esplora 40px, sidebar modello di riferimento, mobile funzionante.
- Preferiti/Segnalazioni/Ordini mobile: H1 24px (P3, §C).
- Stati vuoti: presenti e chiari.

### MERCHANT
- Sidebar (drawer) con Strumenti ✅; bottom nav con Guadagni ✅; Duplica azione ✅; empty state ✅.
- Stato con negozio attivo non verificabile con fixture (negozi QA nel cestino — limite dati dichiarato, invariato rispetto a Fase 10).
- /guadagni per negozio non posseduto: messaggio chiaro, nessun errore.

### AMMINISTRATORE
- 20 pagine misurate: H1 30px su 16/20; 4 fuori scala (template 18px P2; scansioni/cestino 24px P3; dettaglio payout mobile 24px P3).
- Sidebar: densità risolta, 7 gruppi con gerarchia chiara.
- CTA: incoerenza altezze 36–48px (P3).

---

## G. ANALISI DESKTOP/MOBILE

- **1280px**: tutto utilizzabile; nessun overflow; H1 verificati su 20 pagine admin + 7 pubbliche + 6 cliente.
- **375px**: nessun overflow, nessun CTA fuori schermo, drawer admin e merchant funzionanti, bottom nav senza sovrapposizioni. Unico caso mobile: H1 24px responsive su ordini/segnalazioni/payout-detail (P3).
- Touch target e spaziature: adeguati.

---

## H. INCOERENZE VISIVE TRASVERSALI

| Elemento | Valori osservati | Giudizio |
| --- | --- | --- |
| H1 | 30px dominante; 7 casi a 18–24px | incoerenza residua P2/P3 |
| H2 | 12px (etichette uppercase, voluto) · 16 · 18 · 20 · 24px | etichette 12px ok; titoli sezione variano (minore) |
| btn-cta | 36 / 38 / 40 / 44 / 48px | **incoerenza reale** (P3) |
| Input | 40 / 44 / 46px | incoerenza minore (P3) |
| Radius card | 12 / 16 / 24 / full | coerente col linguaggio esistente |
| Colori/badge/stati attivi | coerenti | ⚪ |

---

## I. PRIME 5 MODIFICHE CONSIGLIATE (prossima fase — solo UI/UX, rischio funzionale ZERO)

1. **H1 Template admin → 30px** (`TemplateManagerPage.tsx`) — elimina il P2 più visibile.
2. **/ricerca: aggiungere H1 "Ricerca" (30px) + portare le intestazioni sezione a una dimensione leggibile** (`app/ricerca/page.tsx`) — orientamento dell'utente.
3. **Uniformare gli H1 a 24px → 30px** in: Cestino, Scansioni AI, Preferiti, Segnalazioni, Ordini (mobile), dettaglio Payout — stessa classe già usata altrove.
4. **Uniformare le CTA admin a 40px** (rimuovere `py-3`/regolare `py-2.5` sulle azioni "Crea/Nuovo") — coerenza tra pagine equivalenti.
5. **Uniformare gli input admin a 40px** (o, in alternativa, adottare 44px ovunque) — coerenza form.

---

## J. ROADMAP PROPOSTA (prossima fase)

- **FASE A (impatto rapido, 5 modifiche sopra):** titoli 30px residui + /ricerca + CTA admin 40px + input 40px.
- **FASE B:** eventuale ripensamento della pagina /ricerca (risultati per tipo, empty state con suggerimenti).
- **FASE C:** rifiniture (spaziature dashboard admin, badge, hover/focus) — solo se emergono evidenze.

## K. VINCOLO FUNZIONALITÀ — verifica

Tutte le modifiche consigliate sono **classi CSS (font-size, altezza)** su componenti esistenti: **nessuna modifica a route, href, API, DB, auth, permessi, dati o logica**. Le 5 proposte toccano solo 10 file UI (`TemplateManagerPage`, `CestinoModule`, `ScansioniModule`, `PreferitiModule`, `SegnalazioniClienteModule`, `ordini/page`, `PayoutAdminDetailClient`, `ricerca/page`, + pagine CTA admin). Rischio funzionale: **zero** (le classi usate sono già presenti nel codebase).

---

## RIEPILOGO VERIFICHE

- **Regressione**: `npx tsc --noEmit` ✅ · `npm run build` ✅ (8.1s) · working tree pulito · 10A/10B/10C intatte (git log) · nessun test eseguito in modalità modifica.
- **Screenshot**: 61 reali (pubblico, cliente, merchant, admin — desktop 1280 + mobile 375).
- **Errori**: 0 console · 0 HTTP 4xx/5xx · 0 overflow.
- **Nessuna modifica**: nessun file tracciato toccato, nessun commit/push/deploy.
