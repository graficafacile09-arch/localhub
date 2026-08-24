# AUDIT COMPLETO — OVERFLOW ORIZZONTALE LocalHub

Data: 24/08/2026 · Server: `http://localhost:3100` (dev, Turbopack) · Browser: Chromium (Playwright)
Metodo: per ogni route, 9 viewport (320/360/375/390/414/768/1024/1280/1440) misurando
`document.documentElement.scrollWidth > clientWidth` e i singoli elementi con `rect.right > viewport`
(non clipati da antenati con overflow-x). Le aree protette sono state testate con gli account
fixture del progetto (`scripts/setup-test-users.mjs`, DB locale dev): admin, merchantA, customerA.

---

## 1. INVENTARIO ROUTE

| Gruppo | Route | # |
| --- | --- | --- |
| **Pubbliche** | `/`, `/negozi`, `/negozi?featured=1`, `/categorie`, `/categorie/[slug]×3`, `/negozio/[slug]×3`, `/prodotto/[slug]×3` (+ `/acquista`, `/acquista/ritiro`, `/acquista/spedizione`), `/ricerca` (+`?q=`, `?categoria=`), `/carrello`, `/checkout`, `/ordini/recupera`, `/assistant`, `/ritorno-stripe`, `/test-editor`, `/404-non-esiste` | 43 |
| **Autenticazione** | `/login` (+`?area=cliente|merchant|admin`), `/recupero-password`, `/reset-password`, `/verifica-email`, `/logout-success` | (incluse sopra) |
| **Redirect legacy** | `/profilo`, `/preferiti`, `/ordini` → Area Clienti | (incluse sopra) |
| **Cliente** | `/cliente`, `/cliente/ordini`, `/cliente/preferiti`, `/cliente/profilo`, `/cliente/impostazioni`, `/cliente/segnalazioni` | 6 |
| **Venditore** | `/merchant`, `/merchant/nuovo`, `/merchant/[negozioId]` + `ordini`, `prodotti`, `prodotti/nuovo`, `prodotti/ai`, `guadagni`, `incassi`*, `pagamenti`, `payout`*, `media`, `impostazioni`, `edit` | 14 |
| **Amministratore** | `/amministratore` + `assistente-ai`, `attivita`, `categorie`, `cestino`, `contenuti`, `eventi`, `impostazioni`, `incassi`, `negozi-in-evidenza`, `offerte`, `ordini`, `payout`, `prodotti`, `registro-attivita`, `scansioni`, `segnalazioni`, `statistiche`, `template`, `utenti`, `negozi/[id]` (+`edit`, `media`, `prodotti`, `prodotti/nuovo`, `prodotti/ai`) | 32 |

\* `/merchant/[id]/incassi` e `/merchant/[id]/payout` sono **permanent redirect** verso `/guadagni`: i dati qui sotto
si riferiscono alla stessa pagina /guadagni raggiunta da 3 URL diversi.

**Totale: 95 voci di route · 855 misurazioni route×viewport (95 × 9).**

---

## 2. TABELLA OVERFLOW REALI

| Route | Viewport | Overflow | Elemento | File | Causa | Gravità |
| --- | ---: | ---: | --- | --- | --- | --- |
| TUTTE le pubbliche (`/`, `/negozi`, `/categorie`, `/negozio/*`, `/prodotto/*`, `/ricerca`, `/carrello`, `/checkout`, `/404`, …) | 320 | **+17px** | `div.ml-auto.shrink-0` → button "Accedi" (right 337px) | `components/Header/Header.tsx` + `WeatherWidget.tsx` + `AccountMenu.tsx` | Riga 1 header: logo `w-[130px]` + meteo (82px, solo se l'API risponde) + bottone Accedi (101px) = 325px > 296px disponibili | 🟠 Alto |
| `/cliente/preferiti` | 768 | +2,5px | `select` ordinamento (right 770,5px) | `components/cliente/preferiti/PreferitiModule.tsx` (~riga 213) | Barra filtri `md:flex-row justify-between` (ricerca `sm:w-56` + select): al breakpoint esatto 768px la card supera il contenitore di un soffio | 🟡 Basso |
| `/merchant/[id]/guadagni` (+ `/incassi`, `/payout`) | 320 / 360 | **+52px / +12px** | Coppia date `div.flex.items-center.gap-2` (2 input `w-full` + freccia), right 371,8px | `components/incassi/IncassiClient.tsx` (riga ~232) e `components/merchant/PayoutVenditoreClient.tsx` (riga ~176) | Coppia date con min-content ~339px (2 input `type=date` non comprimibili sotto il minimo intrinseco) in griglia 1 colonna da ~288px | 🟠 Alto |
| `/merchant/[id]/prodotti` | 768 | **+124px** | Riga azioni "Aggiungi con AI / Aggiungi manualmente" (right 892px) | `app/(merchant)/merchant/[negozioId]/prodotti/page.tsx` (riga ~133) | Header `md:flex-row justify-between`: titolo "Prodotti di …" (min ~208px) + azioni (~316px) = 524px > colonna 424px a 768px | 🟠 Alto |
| `/merchant/[id]/pagamenti` | 320 | +12px | `h1` "Negozio QA Commerciante A" | `app/(merchant)/merchant/[negozioId]/pagamenti/page.tsx` (riga ~62) | Card header `flex items-start gap-4`: icona 48px + parola lunga "Commerciante" (text-3xl, min ~208px) = 272px > 248px | 🟡 Medio |
| `/amministratore` | 320 | +6px | `section.card.p-5` (grafici, right 326px) | `components/amministratore/DashboardPage.tsx` (riga ~147-213) | Griglie KPI/grafici: card con min-content ~310px > 296px a 320px | 🟡 Basso |
| `/amministratore/ordini` | 320 / 360 | +52px / +12px | Coppia date (stesso elemento di sopra) | `components/amministratore/ordini/OrdiniAdminClient.tsx` (riga ~197) | Idem: coppia date non comprimibile in griglia 1 colonna | 🟠 Alto |
| `/amministratore/ordini` | 768 / 1280 | **+109px / +79px** | Coppia date (right 876px / 1359px); griglia filtri scrollW 536→1018px | `components/amministratore/ordini/OrdiniAdminClient.tsx` | A md/xl la griglia `md:grid-cols-2 xl:grid-cols-4` ha min-content 1018px (colonna coppia-date = 339px > colonna 214px): la griglia tracima dalla card e allarga la pagina anche su desktop | 🔴 Critico |
| `/amministratore/incassi` | 320 / 360 | +52px / +12px | Coppia date | `components/incassi/IncassiClient.tsx` (admin=true) | Idem (stesso componente) | 🟠 Alto |
| `/amministratore/incassi` | 768 | +57px | Griglia `div.grid.shrink-0` (Pagato/Commissione/Rimborsato/Netto venditore, right 824px) | `components/incassi/IncassiClient.tsx` (riga ~407, `RigaCard`) | `grid shrink-0 grid-cols-3 md:grid-cols-4` rigida dentro card `md:flex-row justify-between`: blocco sinistro + 4 colonne min-content > colonna 424px | 🟠 Alto |
| `/amministratore/payout` | 320 / 360 | +52px / +12px | Coppia date | `components/amministratore/payout/PayoutAdminClient.tsx` (riga ~172) | Idem (stesso componente) | 🟠 Alto |
| `/amministratore/template` | 320 | +12px | `button.btn-cta.ml-auto` (right 332px) | `components/amministratore/TemplateManagerPage.tsx` (riga ~149) | Header `mb-6 flex items-center gap-3` senza wrap: icona + titolo lungo + bottone = min-content ~345px > 320px | 🟡 Medio |
| `/amministratore/categorie` | 1280 | +5px | link "Negozi" (right 1285px) | `components/amministratore/CategorieModule.tsx` (riga ~416) | Footer card `mt-5 flex sm:flex-row` con 4 bottoni `flex-1`: a 1280 una card supera la colonna di 5px | 🟡 Basso |
| `/amministratore/negozi/[id]/prodotti` | 320 | +1px (28 elementi) | Card prodotto / righe griglia | `app/(amministratore)/amministratore/negozi/[negozioId]/prodotti/page.tsx` | Bordi/rounding della griglia a 320px | 🟢 Basso |
| `/amministratore/negozi/[id]/prodotti` | 768 | +52px | Riga azioni (stessa del merchant) | `app/(amministratore)/amministratore/negozi/[negozioId]/prodotti/page.tsx` (riga ~96/147) | Header `md:flex-row justify-between` titolo+azioni, come merchant prodotti | 🟠 Alto |

---

## 3. OVERFLOW INTENZIONALI (NON sono bug)

- **Tabelle admin scorrevoli** (correttamente in `overflow-x-auto`): `UtentiTable` (`min-w-[760px]`), `AttivitaTable` (`min-w-[900px]`), `RegistroAttivitaModule` (celle `whitespace-nowrap` + `<pre>`), `VariantiManager` (`min-w-[560px]`).
- **StoreEditor** (`components/merchant/editor/StoreEditor.tsx`): `main overflow-auto` interno — scroll verticale/orizzontale voluto dell'editor.
- **Switcher negozi admin** (`AdminStoreContext`): `flex gap-1 overflow-x-auto` (chip scorrevoli).
- **Drawer off-canvas dell'editor** (`aside.fixed.inset-y-0.left-0.w-72`): posizionato fuori schermo a sinistra (−288px) quando chiuso — **intenzionale**, nessuno scroll generato.
- **Drawer menu mobile merchant** (`MerchantMobileMenu`): `w-[85%] max-w-xs`, contenuto con `overflow-y-auto`, nessun overflow orizzontale (verificato con drawer aperto a 320px: 0).
- **AssistantPanel**: `w-full` su mobile / `sm:w-[400px]` su desktop, nessun overflow (verificato aperto a 320px).
- **Bottom nav merchant**: `fixed left-0 right-0` → non genera scroll.

---

## 4. PATTERN GLOBALI

1. **Coppia di input data-range non comprimibile** — la causa sistemica n.1 (13 occorrenze su 4 file):
   `div.flex.items-center.gap-2` con **due** `<input type="date" class="w-full">` + freccia. Gli input `w-full` in un
   flex-row non scendono sotto il minimo intrinseco (~150px l'uno) → min-content ~339px. Questa coppia vive dentro
   la griglia filtri `grid gap-3 md:grid-cols-2 xl:grid-cols-4` in:
   - `components/incassi/IncassiClient.tsx`
   - `components/amministratore/ordini/OrdiniAdminClient.tsx`
   - `components/amministratore/payout/PayoutAdminClient.tsx`
   - `components/merchant/PayoutVenditoreClient.tsx`
   Si rompe su mobile (1 colonna: 320/360) **e** su desktop (colonna xl da ~214px < 339px → la griglia diventa più
   larga del viewport: ordini @1280 = +79px).
2. **Header/card azione con `md:flex-row justify-between` + titolo lungo + bottoni a larghezza fissa** — 5 occorrenze:
   merchant `/prodotti` (@768 +124), admin `/negozi/[id]/prodotti` (@768 +52), merchant `/pagamenti` (@320 +12),
   admin `/template` (@320 +12), admin dashboard (@320 +6). Il min-content della riga (parola più lunga del titolo +
   somma dei bottoni) supera la colonna a 768-900px (con sidebar 280px) o a 320px.
3. **Blocchi statistiche `grid ... shrink-0`** dentro card `md:flex-row justify-between` — admin `/incassi` @768 (+57).
4. **L'unico bug delle pagine pubbliche** è il header condiviso (logo 130px + meteo + Accedi) a 320px — introdotto dai
   recenti commit "logo mobile più grande" + "meteo visibile su mobile".

---

## 5. PRIORITÀ DI CORREZIONE

**🔴 Critico**
- Griglia filtri `OrdiniAdminClient` a 768/1280 (+109/+79px): allarga la pagina su **tablet e desktop**. Fix: rendere comprimibile la coppia date (es. `flex-1 min-w-0` sugli input o `grid-cols-[1fr_auto_1fr]`), o `flex-wrap`.

**🟠 Alto**
- Header pubblico a 320px (+17px su TUTTE le pagine pubbliche): ridurre logo su ≤320px o `flex-wrap`/`min-w-0` sulla riga logo+meteo+account.
- Coppia date in `IncassiClient` / `PayoutAdminClient` / `PayoutVenditoreClient` a 320/360 (stesso fix della riga filtri).
- Header `md:flex-row justify-between` di merchant `/prodotti` (@768 +124) e admin `/negozi/[id]/prodotti` (@768 +52): `flex-wrap` sulla riga azioni o `shrink` sui bottoni.
- `grid shrink-0` delle statistiche in admin `/incassi` @768: togliere `shrink-0` o rendere il blocco `min-w-0`/wrap.

**🟡 Medio**
- Merchant `/pagamenti` @320 (+12), admin `/template` @320 (+12), `/cliente/preferiti` @768 (+2,5), admin `/amministratore` @320 (+6).

**🟢 Basso**
- `/amministratore/categorie` @1280 (+5), admin `negozi/[id]/prodotti` @320 (+1). Comportamenti intenzionali segnalati nella sezione 3 (tabelle scrollabili, drawer, bottom nav) — nessun intervento.

---

## 6. NUMERI FINALI

- **Route analizzate:** 95 (43 pubbliche · 6 cliente · 14 venditore · 32 amministratore)
- **Viewport analizzati:** 9 (320 → 1440)
- **Misurazioni:** 855 (route×viewport)
- **Casi overflow reali:** 42 (route×viewport); **cause radice distinte: ~10**
- **Casi intenzionali:** 90 contenitori con scroll interno attivo (≈5 tipi distinti, tutti corretti)
- **File/componenti coinvolti:** ~13 (Header+WeatherWidget+AccountMenu, PreferitiModule, IncassiClient,
  OrdiniAdminClient, PayoutAdminClient, PayoutVenditoreClient, 2× pagina prodotti, pagina pagamenti,
  DashboardPage, TemplateManagerPage, CategorieModule)
- **Cause globali ricorrenti:** 3 (coppia date-range nei filtri; header `md:flex-row justify-between` titolo+azioni;
  griglie `shrink-0` nelle card statistiche) + 1 specifica del header pubblico.

*Nota: nessuna pagina ha `overflow-x-hidden` globale come maschera; tutti gli overflow sopra sono reali e misurabili.
Lo scan ha usato gli account di test del progetto (provvisionati in DB dev locale con lo script ufficiale).*

---

# FASE 2 — CORREZIONE COMPLETA (ESITO)

## File modificati (12 + 1 nuovo)
1. `components/ui/FiltroDataRange.tsx` (NUOVO) — coppia date comprimibile condivisa (`grid minmax(0,1fr)/auto/minmax(0,1fr)` + `min-w-0`).
2. `components/Header/Header.tsx` — logo mobile 130→110px, gap ridotti, `flex-wrap` di sicurezza sulla riga.
3. `components/Header/AccountMenu.tsx` — bottone "Accedi" `px-3` su mobile (`sm:px-4`).
4. `components/incassi/IncassiClient.tsx` — griglia filtri `minmax(0,1fr)`, coppia date → `FiltroDataRange`, `min-w-0` su select/bottone; `RigaCard`: via `shrink-0`, `min-w-0` + `flex-wrap` sulla riga.
5. `components/amministratore/ordini/OrdiniAdminClient.tsx` — stessa correzione griglia filtri (fix critico 768/1280).
6. `components/amministratore/payout/PayoutAdminClient.tsx` — stessa correzione.
7. `app/(merchant)/merchant/[negozioId]/prodotti/page.tsx` — header `md:flex-row md:flex-wrap` + titolo/azioni `min-w-0`/`shrink`.
8. `app/(amministratore)/amministratore/negozi/[negozioId]/prodotti/page.tsx` — idem + badge `min-w-0` e riga azioni `flex-wrap` (+1px @320).
9. `app/(merchant)/merchant/[negozioId]/pagamenti/page.tsx` — icona/gap/titolo responsive.
10. `components/amministratore/TemplateManagerPage.tsx` — header `flex-wrap`.
11. `components/amministratore/DashboardPage.tsx` — sezioni `min-w-0`, titoli card `truncate`.
12. `components/amministratore/CategorieModule.tsx` — card `min-w-0` + footer `flex-wrap`.
13. `components/cliente/preferiti/PreferitiModule.tsx` — barra filtri `flex-wrap` + `ml-auto`.

## Verifica post-fix (audit completo rieseguito: 95 route × 9 viewport = 855 misurazioni)

| Metrica | Prima | Dopo |
| --- | ---: | ---: |
| Overflow reali (route×viewport) | 42 | **0** |
| Route con overflow | ~20 | 0 |
| Contenitori overflow intenzionali | 90 | 90 (invariati) |
| Elementi fixed fuori viewport (drawer editor chiuso, intenzionale) | 10 | 10 (invariati) |

Tutti i casi reali dell'audit (header pubblico @320, coppie date, griglia ordini admin 768/1280, header titolo+azioni,
statistiche admin, preferiti @768, categorie @1280, admin prodotti @320) sono **azzerati**: in nessun viewport
`document.documentElement.scrollWidth > clientWidth` per i layout non intenzionali.

### Overflow residui e conferma intenzionalità
- **0 overflow residui reali.**
- Restano intenzionali (già presenti prima, non modificati): tabelle admin scrollabili in `overflow-x-auto`
  (UtentiTable/AttivitaTable/RegistroAttivita/VariantiManager), `overflow-auto` di StoreEditor, switcher negozi
  `overflow-x-auto`, drawer mobile (85% viewport), drawer editor off-canvas chiuso (fixed a sinistra), bottom nav
  `fixed left-0 right-0`, AssistantPanel `w-full`.

## Verifiche tecniche
- `npx tsc --noEmit` → OK (0 errori).
- `git diff --check` → OK.
- `npm run build` → ✓ Compiled successfully, EXIT 0.
- `npx eslint` sui file modificati → nessun problema nuovo rispetto a HEAD (i 6 problemi rilevati —
  `react-hooks/set-state-in-effect` in IncassiClient/OrdiniAdminClient/PayoutAdminClient + warning in
  TemplateManagerPage — sono preesistenti, verificati su `git show HEAD:`).
- Comportamento responsive verificato: a 320px la coppia date rende a ~113px/campo (guadagni) e ~93px/campo
  (ordini xl); con etichette meteo lunghe il bottone Account va su una seconda riga (nessuno scroll, meteo
  sempre completo sulla prima riga).

## Rollback
- Tag di rollback: **`rollback-overflow-fix-pre`** @ `9899ee2` (stato pre-correzione).
- Commit della correzione: vedi SHA nel report finale (fase 2).
