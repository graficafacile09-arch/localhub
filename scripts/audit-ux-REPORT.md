# AUDIT UX/UI — LOCALHUB (FASE 10)

- **Data:** 2026-08-24 · **Ambiente:** dev locale :3100 (stesso Supabase di prod) · **Solo lettura**
- **Metodo:** Playwright su schermate reali con account fixture (desktop 1280 + mobile 375), 50+ screenshot (`screenshots-ux-audit/`), analisi DOM/CSS delle strutture di navigazione e metriche visive.
- **Limite dichiarato:** le schermate merchant con negozio ATTIVO non sono raggiungibili con gli account di test (negozi QA nel cestino; la sessione admin su /merchant redirect a /amministratore). L'area merchant è quindi valutata su: stato "nessun negozio", codice di navigazione, e UI condivisa store (editor amministratore).

---

## 1. GIUDIZIO GENERALE

L'app è **graficamente coerente e funzionalmente solida**: una lingua visiva comune (blu brand, giallo CTA, bianco/`slate`, radius 16px, font system 16px) attraversa i quattro ambienti. Il problema non è la "grafica datata": è la **gerarchia dell'informazione**. L'area pubblica è chiara e moderna; le aree riservate (soprattutto admin) soffrono di **menu piatti con troppe voci di peso diverso**, gruppi eterogenei e poca differenziazione tra funzione primaria e strumento secondario. Il giudizio complessivo: **UX buona in pubblico/cliente, media in merchant, densa e poco gerarchica in admin**.

---

## 2. AREA PUBBLICA — giudizio: BUONA

| Voce | Posizione | Funzione | Importanza | Problema UX | Problema grafico |
| --- | --- | --- | --- | --- | --- |
| Home / Negozi / Categorie / Carrello | Nav sotto l'header, icona sopra + testo sotto | Navigazione principale | ALTA | ✅ chiara | ✅ coerente |
| Logo | Header sinistra | Home | ALTA | ✅ | ✅ |
| Meteo (Castrovillari) | Header, tra logo e Account | Info locale | MEDIA | ✅ | ✅ |
| Account ("Accedi") | Header destra | Login cliente/venditore | ALTA | ✅ il menu a tendina è chiaro | ✅ |
| Ricerca | Hero homepage | Ricerca | ALTA | ✅ | ✅ |
| Footer (Home/Negozi/Categorie/In evidenza/Accedi/Amministrazione) | Footer | Navigazione secondaria | MEDIA/BASSA | ⚠️ "Amministrazione" nel footer è un ingresso funzionale importante reso visivamente minimale (link testo piccolo) — rischio che l'admin reale non lo trovi | ⚠️ |

**Osservazioni concrete:**
- La gerarchia dei titoli è **disomogenea**: hero 48px, ma le pagine di contenuto hanno titoli piccoli (`/negozi` 18px, `/categorie` 20px) — lo stesso peso visivo di un H2 interno admin. Un visitatore non percepisce subito "sono nella pagina X".
- L'ingresso `/admin` è volutamente "nascosto" (solo footer): coerente con la sicurezza, ma per l'admin reale è l'unico modo di entrare nel pannello → il link footer è l'unica via scopribile. Se l'obiettivo è l'uso reale, andrebbe reso un po' più visibile (o documentato) senza cambiare la sicurezza.

## 3. AREA CLIENTE — giudizio: BUONA

| Voce | Posizione | Importanza | Problema |
| --- | --- | --- | --- |
| Dashboard · Ordini · Preferiti · Profilo · Segnalazioni | Sidebar sinistra, con descrizione per riga | ALTA/MEDIA | ✅ |
| "Comprimi menu" | Sidebar | BASSA | ✅ |
| Esci | Drawer/cliente | ALTA | ✅ |

**Osservazioni:** struttura semplice (5 voci con descrizioni ricche) — è il modello migliore dell'app. Dashboard un po' densa (molte card/shortcut), ma accettabile.

## 4. AREA MERCHANT — giudizio: MEDIA

Nav negozio (sidebar, 8 voci **piatte**): Dashboard, Prodotti, Ordini, Guadagni, Pagamenti, Libreria Media, Impostazioni negozio, Duplica negozio.

| Voce | Importanza | Problema UX |
| --- | --- | --- |
| Dashboard / Prodotti / Ordini / Guadagni | ALTA | ✅ |
| Pagamenti / Media / Impostazioni | MEDIA | ⚠️ stesso peso visivo delle voci primarie |
| Duplica negozio | BASSA (strumento) | ⚠️ in lista con le funzioni primarie; sembra un'azione secondaria |

**Osservazioni concrete:**
- **Lista piatta di 8 voci senza raggruppamento**: "Duplica negozio" (strumento raro) è visivamente uguale a "Prodotti" (funzione quotidiana). Le righe hanno icone+descrizioni (buone), ma manca una separazione primari/secondari.
- **Bottom nav mobile = Home, Negozio, Prodotti, Ordini, AI**: **"Guadagni" non c'è** — la parte economica (importante per un venditore) è raggiungibile solo dal drawer/sidebar su mobile. Se c'è spazio (5 voci), vale la pena valutare la sostituzione di una voce secondaria o l'accesso rapido.
- **Bug meta (non funzionale ma UX):** `/merchant` ha come titolo di pagina *"I negozi di Castrovillari on-line"* (titolo della pagina pubblica /negozi) invece di un titolo dell'area venditore — nel tab del browser l'utente non capisce dove si trova.
- **Stato vuoto "Nessun negozio trovato"** con CTA "Crea il tuo primo negozio": ✅ buono e chiaro.

## 5. AREA AMMINISTRATORE — giudizio: DENSA / POCO GERARCHICA (prioritaria)

Sidebar con **5 gruppi accordion (tutti aperti di default) + 3 link negozi in fondo + "Torna al sito"** → 21+ voci.

| Gruppo | Voci | Osservazione |
| --- | --- | --- |
| Panoramica | Panoramica (1) | ✅ |
| Negozi & Catalogo | Negozi, **Cestino**, Prodotti, Categorie, Negozi in evidenza (5) | ⚠️ "Cestino" (strumento di RECUPERO, bassa frequenza) è la **2ª voce del gruppo**, appena sotto "Negozi" — posizione visiva alta per uno strumento secondario |
| Ordini & Pagamenti | Ordini, Incassi, Payout (3) | ✅ gruppo coerente; ma Payout (finanza/regolamento) ha lo stesso peso di Ordini senza separazione |
| Contenuti & Promozioni | Offerte, Eventi, Contenuti, Template (4) | ✅ |
| Piattaforma | Utenti, Segnalazioni, Statistiche, Assistente AI, Scansioni AI, Registro attività, Impostazioni (7) | 🔴 **contenitore eterogeneo**: gestione utenti + segnalazioni + monitoraggio + strumenti AI + impostazioni. È il gruppo meno coerente |
| (in fondo) | Panificio Rossi · Barone Gioielli · Bar dei Capoccioni | ⚠️ **link a dati reali** (negozi) mescolati alle voci di navigazione: sembrano voci di menu ma sono dati dinamici; fuori contesto possono confondere |
| (in fondo) | Torna al sito | ✅ |

**Risposta alla domanda specifica (elementi di priorità diversa con lo stesso peso visivo):** sì — dentro "Piattaforma", *Impostazioni* (configurazione di sistema) ha la stessa riga di *Assistente AI* (strumento); dentro "Negozi & Catalogo", *Negozi in evidenza* (curatela) è uguale a *Prodotti* (funzione primaria); e *Cestino* è in seconda posizione con peso da voce primaria.

**Organizzazione consigliata (concettuale, da validare):**
```
GESTIONE          Negozi · Prodotti · Categorie · Negozi in evidenza
ORDINI & FINANZA  Ordini · Incassi · Payout
PROMOZIONI        Offerte · Eventi · Contenuti · Template
PIATTAFORMA       Utenti · Segnalazioni · Impostazioni
STRUMENTI         Statistiche · Assistente AI · Scansioni AI · Registro attività
RECUPERO          Cestino (in fondo, come "cestino" del sistema)
```
Razionale: separare RECUPERO (Cestino) dagli strumenti quotidiani, spezzare "Piattaforma" in *Piattaforma* (persone/configurazione) e *Strumenti* (monitoraggio/AI), tenere Ordini+Incassi+Payout come blocco finanziario unico. **Nessun link cambia.**

## 6. SIDEBAR ADMIN — approfondimento
- **Mobile**: la sidebar è un **drawer off-canvas** (hamburger "Apri il menu") ✅ pattern corretto. Ma quando aperto mostra l'elenco completo di 21 voci: su telefono è una lista molto lunga da scorrere. 
- **Desktop**: accordion tutti aperti di default → si vede subito tutto (21 voci), il che appiattisce la gerarchia. Chiudere di default i gruppi secondari (o riordinare) aiuterebbe la focalizzazione.
- **Problema: A struttura, B grafica, o C entrambe?** → **A (struttura) principalmente**: la grafica delle righe (icona in chip + etichetta) è buona; il problema è come le voci sono raggruppate e ordinate. C'è anche una componente grafica minore: nessuna differenziazione visiva tra voci primarie e secondarie dentro lo stesso gruppo.

## 7. HEADER E NAVIGAZIONE
- Pubblico: logo+meteo+account in riga, nav 4 voci sotto — **chiaro e coerente** ✅.
- Il passaggio da pubblico a aree riservate cambia completamente shell (header diverso, sidebar/bottom-nav): normale per app, ma il **titolo di pagina /merchant errato** (vedi §4) e la mancanza di un crumb/breadcrumb nelle aree rende l'orientamento più difficile.

## 8. MOBILE
- Pubblico: ✅ usabile (nav 4 voci sempre visibili).
- Cliente: sidebar con "Comprimi menu" + drawer Esci — ✅.
- Merchant: bottom nav 5 voci (Home/Negozio/Prodotti/Ordini/AI) — **manca Guadagni** (v. §4).
- Admin: drawer hamburger — ✅ pattern, ma 21 voci da scorrere a ogni apertura (v. §6).

## 9. INCOERENZE GRAFICHE
- **Coerenti**: body 16px slate-900 · radius 16px · giallo CTA (yellow-400) · blu brand · card senza ombre forti.
- **Minori**: altezza pulsanti varia (Accedi 36px, CTA pagine 44px, azioni admin 48px) — diverse famiglie di pulsanti, ma percepibile; il giallo è espresso sia `rgb(250,204,21)` sia `lab(...)` (stesso colore, rappresentazioni diverse — non visibile, solo nota di codice).
- **Meta-dato**: titolo `/merchant` = titolo della pagina pubblica (v. §4).

## 10. PROBLEMI (P1/P2/P3)

| # | Prio | Ambiente | Problema | Tipo |
| --- | --- | --- | --- | --- |
| 1 | 🔴 P1 | Admin | Cestino (recupero, bassa priorità) in 2ª posizione del gruppo Negozi & Catalogo con peso visivo da voce primaria | UX |
| 2 | 🔴 P1 | Admin | "Piattaforma" = contenitore eterogeneo di 7 voci (utenti+AI+monitoraggio+impostazioni) senza sottogruppi | UX |
| 3 | 🟠 P2 | Merchant | Bottom nav mobile senza "Guadagni" (parte economica non raggiungibile velocemente) | UX |
| 4 | 🟠 P2 | Merchant | Lista nav piatta di 8 voci: "Duplica negozio" (strumento) uguale a "Prodotti" (primaria) | UX |
| 5 | 🟠 P2 | Merchant | Titolo pagina `/merchant` errato ("I negozi di Castrovillari on-line") | UX (meta) |
| 6 | 🟠 P2 | Admin | Sidebar: 21 voci tutte aperte di default → gerarchia appiattita; gruppi secondari da chiudere/ridurre | UX |
| 7 | 🟠 P2 | Admin | Link a 3 negozi reali in fondo alla sidebar: dati mescolati alla navigazione | UX |
| 8 | 🟡 P3 | Pubblico | Titoli pagine contenuto (18-20px) troppo piccoli rispetto all'hero (48px): scala H1 disomogenea | Visivo |
| 9 | 🟡 P3 | Pubblico | Ingresso "Amministrazione" solo nel footer (scopribilità per l'admin reale) | UX/Visivo |
| 10 | 🟡 P3 | Tutti | Altezza pulsanti non uniforme (36/44/48px) tra ambienti | Visivo |

## 11. ELEMENTI DA NON TOCCARE (⚪)
- Nav pubblica a 4 voci (icona sopra/testo sotto) — già chiara e rifinita.
- Widget meteo nell'header.
- Sidebar cliente (5 voci con descrizione) — il modello migliore; **da replicare**, non da cambiare.
- Stato vuoto merchant "Nessun negozio trovato".
- Lingua visiva di base (blu/giallo/radius/typography).
- Drawer off-canvas admin su mobile (pattern giusto).

## 12. ROADMAP
**FASE A (quick wins, solo riordino/classi — nessuna logica cambiata):**
1. Riorganizzare la sidebar admin in 5-6 gruppi bilanciati (spostare Cestino in fondo come "RECUPERO"; spezzare Piattaforma in Piattaforma+Strumenti) — stessi link, stesso comportamento.
2. Correggere il titolo meta di `/merchant`.

**FASE B (struttura merchant + mobile):**
3. Raggruppare la nav negozio merchant (primari: Dashboard/Prodotti/Ordini/Guadagni; secondari raggruppati: Pagamenti/Media/Impostazioni/Duplica).
4. Valutare l'inserimento di "Guadagni" nella bottom nav mobile (o sostituire una voce meno usata).
5. Chiudere di default i gruppi secondari della sidebar admin.

**FASE C (rifiniture):**
6. Scala titoli più coerente nelle pagine pubbliche.
7. Uniformare l'altezza dei pulsanti primari tra ambienti.
8. Separare visivamente i link-negozio in fondo alla sidebar admin (etichetta di sezione).

## 13. PRIME 5 MODIFICHE CON MAGGIOR IMPATTO PERCEPITO
1. **Sidebar admin riorganizzata** (Cestino→fondo, Piattaforma spezzata): si capisce subito da dove iniziare.
2. **Gruppi admin chiusi di default**: meno rumore, gerarchia leggibile.
3. **Nav merchant raggruppata** (primari vs secondari): il venditore trova subito Prodotti/Ordini/Guadagni.
4. **"Guadagni" nella bottom nav mobile**: la parte economica a portata di pollice.
5. **Titolo di pagina corretto su /merchant**: orientamento immediato.

---

### Nota funzionale vs UX vs visivo
Nessuna delle osservazioni richiede modifiche funzionali: **tutti gli interventi proposti sono di struttura/gerarchia visiva (UX) o estetica (visivo), con zero impatto su route, href, API, permessi o dati.** L'unica voce che tocca la "percezione di funzionalità" è l'eventuale aggiunta di "Guadagni" alla bottom nav mobile: se si decidesse, va verificato che non cambi il comportamento di navigazione esistente (aggiunta di un link, non sostituzione di logica).
