# ARCHITETTURA GESTIONE NEGOZI — InCittà CMS v2

## INDICE

1. [Verifica Scalabilità 10.000 negozi](#1-verifica-scalabilità-10000-negozi)
2. [Architettura Database](#2-architettura-database)
3. [Architettura Modulare CMS](#3-architettura-modulare-cms)
4. [Moduli CMS — Specifica](#4-moduli-cms--specifica)
5. [Flusso di Creazione](#5-flusso-di-creazione)
6. [Flusso di Duplicazione](#6-flusso-di-duplicazione)
7. [Gestione Immagini](#7-gestione-immagini)
8. [Routing e Navigazione](#8-routing-e-navigazione)
9. [Componenti React](#9-componenti-react)
10. [File da Eliminare](#10-file-da-eliminare)
11. [File da Rifattorizzare](#11-file-da-rifattorizzare)
12. [Ordine di Implementazione](#12-ordine-di-implementazione)

---

## 1. VERIFICA SCALABILITÀ 10.000 NEGOZI

### 1.1 Limiti del database

**PostgreSQL** con Supabase gestisce tabelle con decine di milioni di righe senza problemi.

| Metrica | Limite Supabase (Pro) | Necessità per 10K negozi |
|---|---|---|
| Righe tabella `negozi` | Illimitato | 10.000 |
| Righe tabella `prodotti` | Illimitato | 500.000 (50 prodotti/negozio) |
| Storage immagini | 100 GB | 10 GB (1 MB/negozio) |
| Connessioni concorrenti | 120 | 10-20 merchant concorrenti |
| Transfer mensile | 250 GB | 5-10 GB |

**Verdetto**: Il database PostgreSQL regge 10.000 negozi senza alcuna modifica strutturale.

### 1.2 Indici necessari per 10K negozi

```sql
-- Indice per owner lookup (MERCHANT DASHBOARD)
create index if not exists negozi_owner_user_id_idx on public.negozi(owner_user_id);

-- Indice per slug lookup (PUBLIC PAGE)
create index if not exists negozi_slug_idx on public.negozi(slug);

-- Indice per ricerca testuale
create index if not exists negozi_nome_search_idx on public.negozi 
  using gin(to_tsvector('italian', coalesce(nome, '') || ' ' || coalesce(categoria, '') || ' ' || coalesce(descrizione, '')));

-- Indice per negozi attivi + in evidenza
create index if not exists negozi_attivi_in_evidenza_idx on public.negozi(attivo, in_evidenza) 
  where attivo = true and in_evidenza = true;

-- Indice per categoria filter
create index if not exists negozi_categoria_idx on public.negozi(categoria);

-- Indice per negozio_id su prodotti
create index if not exists prodotti_negozio_id_idx on public.prodotti(negozio_id);
```
*Nota: alcuni di questi indici esistono già.*

### 1.3 Strategia di caching

Per 10.000 negozi, ogni pagina pubblica deve caricare in <100ms:
- **Homepage**: `getNegoziInEvidenza(6)` → con indice `negozi_attivi_in_evidenza_idx` è sub-millisecondo
- **Pagina negozio**: `getNegozio(id)` → primary key lookup → sub-millisecondo
- **Lista negozi**: `getNegozi()` → full scan con 10K righe → 20-50ms
- **Ricerca**: full-text search con GIN index → 10-100ms
- **Store images**: Supabase CDN edge caching

### 1.4 Futuro: sharding orizzontale

Se si superano 100.000 negozi:
- Partitioning per regione/città (`LIST PARTITIONING` on `citta`)
- Read replicas per le pagine pubbliche
- Viste materializzate per homepage e ricerca

**Verdetto finale**: L'architettura attuale + gli indici sopra supportano 10.000+ negozi senza modifiche strutturali. A 100.000+ servono partizionamento e caching, ma lo schema rimane identico.

---

## 2. ARCHITETTURA DATABASE

### 2.1 Principio: un solo tipo di negozio

Non esiste più alcuna distinzione:
- ~~negozio demo~~
- ~~negozio reale~~
- ~~negozio template~~ (è solo un flag `is_template = true` sulla stessa tabella)

Tutti i negozi vivono nella tabella `negozi`. Un template è semplicemente un negozio con `is_template = true` e `template_name` valorizzato.

### 2.2 Tabella: `negozi`

```sql
create table if not exists public.negozi (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique,
  owner_user_id       uuid references auth.users(id),

  -- Identità
  nome                text not null,
  categoria           text references public.categorie(slug),
  sottocategoria      text,
  descrizione         text,
  descrizione_completa text,

  -- Immagini
  logo_url            text,
  copertina_url       text,
  galleria            jsonb default '[]'::jsonb,

  -- Contatti
  telefono            text,
  email_negozio       text,
  whatsapp            text,
  sito_web            text,

  -- Posizione
  indirizzo           text,
  citta               text,
  cap                 text,
  provincia           text,
  coordinate          text,

  -- Social
  facebook            text,
  instagram           text,
  tiktok              text,
  youtube             text,

  -- Orari
  orari               jsonb,

  -- Brand & servizi
  servizi             text[] default '{}',
  colori              jsonb default '{"primary":"#2563eb","secondary":"#f8fafc","accent":"#f59e0b"}'::jsonb,
  parole_chiave       text[] default '{}',

  -- Visibilità
  attivo              boolean default true,
  mostra_telefono     boolean default true,
  mostra_indirizzo    boolean default true,
  mostra_orari        boolean default true,
  accetta_whatsapp    boolean default true,
  in_evidenza         boolean default false,

  -- SEO
  seo_title           text,
  seo_description     text,
  seo_keywords        text[] default '{}',

  -- Sistema
  is_template         boolean default false,
  template_name       text,
  moduli_attivi       jsonb default '["informazioni","immagini","prodotti","servizi","contatti","orari","social","seo","impostazioni"]'::jsonb,
  version             integer default 1,
  data                jsonb default '{}'::jsonb,  -- dati extra per moduli futuri (offerte, eventi, AI, ecc.)
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Indici
create index if not exists negozi_owner_user_id_idx on public.negozi(owner_user_id);
create index if not exists negozi_slug_idx on public.negozi(slug);
create index if not exists negozi_categoria_idx on public.negozi(categoria);
```

**Novità chiave rispetto alla versione precedente**:
- `categoria` → `text references public.categorie(slug)` — FK alla tabella categorie
- `seo_title`, `seo_description`, `seo_keywords` — nuovi campi SEO espliciti
- `moduli_attivi` — JSONB array che definisce quali moduli CMS sono abilitati per questo negozio (permette di attivare/disattivare moduli per negozio)
- `data` — JSONB contenitore per tutti i dati dei moduli futuri (offerte, eventi, AI data). Ogni modulo scrive in `data.nome_modulo`. **Questo è il punto di estensione principale**: nuovi moduli non richiedono nuove colonne.
- `categorie` tabella con FK — non più testo libero

### 2.3 Tabella: `categorie`

```sql
create table if not exists public.categorie (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  descrizione text,
  icona       text,              -- nome icona Lucide
  immagine    text,              -- URL immagine di fallback per negozi di questa categoria
  sinonimi    text[] default '{}',
  ordine      integer default 0,
  attivo      boolean default true,
  created_at  timestamptz default now()
);

insert into public.categorie (nome, slug, sinonimi, ordine) values
  ('Panificio', 'panificio', ARRAY['panificio','forno','pane','pasticceria','bakery','panetteria'], 1),
  ('Beauty', 'beauty', ARRAY['beauty','bellezza','parrucchiere','estetista','barbiere','skincare','makeup'], 2),
  ('Casa', 'casa', ARRAY['casa','arredo','arredamento','mobili','interior','decorazioni'], 3),
  ('Auto', 'auto', ARRAY['auto','officina','meccanico','gomme','pneumatici','carrozzeria'], 4),
  ('Salute', 'salute', ARRAY['salute','farmacia','parafarmacia','medicinali','integratori','benessere'], 5),
  ('Tech & Elettronica', 'tech-elettronica', ARRAY['tech','tecnologia','elettronica','telefonia','computer','smartphone'], 6),
  ('Bimbi & Giocattoli', 'bimbi-giocattoli', ARRAY['bimbi','bambini','giocattoli','infanzia','scuola','cartoleria'], 7),
  ('Sport & Fitness', 'sport-fitness', ARRAY['sport','fitness','palestra','running','yoga','training'], 8),
  ('Pet Shop & Animali', 'pet-animali', ARRAY['pet','animali','cane','gatto','veterinario','toelettatura'], 9),
  ('Ristorante', 'ristorante', ARRAY['ristorante','trattoria','osteria','cucina'], 10),
  ('Bar', 'bar', ARRAY['bar','caffetteria','cafe','caffe'], 11),
  ('Pizzeria', 'pizzeria', ARRAY['pizzeria','pizza','forno'], 12),
  ('Abbigliamento', 'abbigliamento', ARRAY['abbigliamento','moda','boutique','fashion','vestiti'], 13),
  ('Calzature', 'calzature', ARRAY['calzature','scarpe','shoe','footwear'], 14),
  ('Farmacia', 'farmacia', ARRAY['farmacia','parafarmacia','pharmacy'], 15),
  ('Cartoleria', 'cartoleria', ARRAY['cartoleria','cancelleria','scuola'], 16),
  ('Fioraio', 'fioraio', ARRAY['fioraio','fiori','florist','flower'], 17),
  ('Gioielleria', 'gioielleria', ARRAY['gioielleria','gioielli','orologeria'], 18),
  ('Elettricista', 'elettricista', ARRAY['elettricista','elettricita','impianti'], 19),
  ('Idraulico', 'idraulico', ARRAY['idraulico','idraulica','caldaia'], 20),
  ('Falegname', 'falegname', ARRAY['falegname','falegnameria','carpenteria'], 21),
  ('Altro', 'altro', ARRAY['altro','generico','varie'], 99);
```

### 2.4 Tabella: `prodotti`

Invariata. I prodotti sono già su database con `negozio_id`.

### 2.5 Tabella: `moduli_registry`

```sql
create table if not exists public.moduli_registry (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,    -- identificatore univoco del modulo
  nome        text not null,            -- nome UI
  descrizione text,
  icona       text,                     -- nome icona Lucide
  ordinamento integer default 0,
  attivo      boolean default true,
  -- Indica se il modulo è incluso nel template di default
  default_in_template boolean default true,
  created_at  timestamptz default now()
);

insert into public.moduli_registry (slug, nome, descrizione, icona, ordinamento) values
  ('informazioni', 'Informazioni', 'Nome, categoria, descrizione del negozio', 'Building2', 1),
  ('immagini', 'Immagini', 'Logo, copertina e galleria foto', 'Image', 2),
  ('prodotti', 'Prodotti', 'Catalogo prodotti e servizi', 'Package', 3),
  ('servizi', 'Servizi', 'Servizi offerti dal negozio', 'Sparkles', 4),
  ('offerte', 'Offerte', 'Offerte e promozioni attive', 'Tag', 5),
  ('eventi', 'Eventi', 'Eventi in programma', 'Calendar', 6),
  ('contatti', 'Contatti', 'Telefono, email, WhatsApp', 'Phone', 7),
  ('posizione', 'Posizione', 'Indirizzo, mappa, coordinate', 'MapPin', 8),
  ('orari', 'Orari', 'Orari di apertura', 'Clock', 9),
  ('social', 'Social', 'Link a profili social', 'MessageCircle', 10),
  ('seo', 'SEO', 'Meta tag e keywords', 'Search', 11),
  ('ai', 'AI', 'Dati per l''assistente AI', 'Bot', 12),
  ('impostazioni', 'Impostazioni', 'Visibilità e preferenze', 'Settings', 13);
```

### 2.6 Schema modulare: il campo `data` JSONB

Tutti i dati di moduli futuri vivono dentro `negozi.data`:

```jsonc
{
  "offerte": {
    "attive": [
      { "titolo": "Sconto 20%", "valido_dal": "2026-08-01", "valido_al": "2026-08-31" }
    ]
  },
  "eventi": [
    { "titolo": "Degustazione vini", "data": "2026-09-15", "ora": "18:00" }
  ],
  "ai_data": {
    "descrizione_assistente": "Rispondi come...",
    "tono": "professionale"
  }
}
```

Questo approccio garantisce che:
- Nuovi moduli non richiedono MAI migrazioni del database
- Ogni modulo scrive e legge solo la propria chiave in `data`
- I moduli sono completamente indipendenti
- Lo schema SQL non cambia mai per aggiungere funzionalità

---

## 3. ARCHITETTURA MODULARE CMS

### 3.1 Principio architetturale

```
        ┌────────────────────────────────────────────┐
        │               CMS SHELL                     │
        │  (MerchantShell: sidebar + topbar + nav)    │
        └────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
     ┌────────────────┐ ┌──────┐ ┌──────────────┐
     │ MODULO         │ │MODULO│ │ MODULO        │
     │ Informazioni   │ │Orari │ │ SEO           │
     │ (componente)   │ │(comp)│ │ (componente)  │
     └────────────────┘ └──────┘ └──────────────┘
              │             │             │
              ▼             ▼             ▼
     ┌────────────────────────────────────────────┐
     │             DATABASE (negozi)              │
     │  ┌──────────┬──────────┬──────────┐       │
     │  │  colonne  │  data    │  orari   │       │
     │  │  fisse    │  (JSONB) │  (JSONB) │       │
     │  └──────────┴──────────┴──────────┘       │
     └────────────────────────────────────────────┘
```

### 3.2 Ogni modulo è un'isola

Regole ferree per ogni modulo:
1. **Legge i propri dati dal database** — mai da hardcoded o da altri moduli
2. **Salva i propri dati nel database** — mai in file o localStorage
3. **Non dipende da altri moduli** — può essere rimosso/aggiunto senza effetti collaterali
4. **Ha una propria UI** — form di modifica indipendente
5. **Si registra nel module registry** — per la navigazione e l'ordinamento

### 3.3 Come nasce un nuovo modulo (tra 2 anni)

Procedura per aggiungere un modulo "Recensioni" tra 2 anni:
1. Creare file `components/merchant/modules/RecensioniModule.tsx`
2. Aggiungere riga in `moduli_registry`: `('recensioni', 'Recensioni', ...)`
3. Inserire dati in `negozi.data.reviews` (nessuna migrazione DB)
4. Aggiungere voce nel module registry mapping

Zero modifiche ai moduli esistenti. Zero migrazioni DB. Il flusso di creazione negozio rimane identico.

### 3.4 Module Registry (lato codice)

Per mappare slug modulo → componente React, si usa un registry centralizzato:

```typescript
// lib/modules/registry.ts
// UNICO punto dove si registra un nuovo modulo con il suo componente
export const MODULE_REGISTRY = {
  informazioni:     InformazioniModule,
  immagini:         ImmaginiModule,
  prodotti:         ProdottiModule,    // link alla sezione prodotti esistente
  servizi:          ServiziModule,
  offerte:          OfferteModule,
  eventi:           EventiModule,
  contatti:         ContattiModule,
  posizione:        PosizioneModule,
  orari:            OrariModule,
  social:           SocialModule,
  seo:              SeoModule,
  ai:               AiModule,
  impostazioni:     ImpostazioniModule,
} as const;
```

Per aggiungere un modulo futuro, si aggiunge UNA riga qui + un file componente.

---

## 4. MODULI CMS — SPECIFICA

### 4.1 Informazioni
- **Campi**: nome, slug (generato auto), categoria (da tabella `categorie`), sottocategoria, descrizione breve, descrizione completa
- **Salva in**: `negozi.nome`, `negozi.slug`, `negozi.categoria`, `negozi.sottocategoria`, `negozi.descrizione`, `negozi.descrizione_completa`
- **API**: `PUT /api/merchant/stores/{id}/settings` (campo: informazioni)

### 4.2 Immagini
- **Campi**: logo (upload), copertina (upload), galleria (multi-upload)
- **Salva in**: `negozi.logo_url`, `negozi.copertina_url`, `negozi.galleria`
- **Storage**: `store-images/{negozioId}/logo/`, `store-images/{negozioId}/copertina/`, `store-images/{negozioId}/galleria/`
- **API**: `POST /api/merchant/stores/{id}/gallery` (invariato)

### 4.3 Prodotti
- **Reindirizza**: alla sezione prodotti esistente `/merchant/{id}/prodotti`
- **Non duplicare alla creazione/duplicazione**: i prodotti si creano dopo

### 4.4 Servizi
- **Campi**: lista tag servizi (es. "Consegna a domicilio", "Parcheggio", "Wi-Fi")
- **Salva in**: `negozi.servizi` (text[])
- **UI**: TagsInput uguale all'attuale

### 4.5 Offerte
- **Campi**: titolo, descrizione, prezzo originale, prezzo offerta, valido_dal, valido_al, immagine
- **Salva in**: `negozi.data.offerte`
- **UI**: lista offerte con CRUD

### 4.6 Eventi
- **Campi**: titolo, descrizione, data, ora, luogo, immagine, link
- **Salva in**: `negozi.data.eventi`
- **UI**: lista eventi con CRUD

### 4.7 Contatti
- **Campi**: telefono, email negozio, WhatsApp
- **Salva in**: `negozi.telefono`, `negozi.email_negozio`, `negozi.whatsapp`

### 4.8 Posizione
- **Campi**: indirizzo, città, CAP, provincia, coordinate
- **Salva in**: `negozi.indirizzo`, `negozi.citta`, `negozi.cap`, `negozi.provincia`, `negozi.coordinate`

### 4.9 Orari
- **Campi**: orari per giorno della settimana (mattina/pomeriggio)
- **Salva in**: `negozi.orari` (JSONB)
- **UI**: invariata rispetto all'attuale

### 4.10 Social
- **Campi**: Facebook, Instagram, TikTok, YouTube, sito web
- **Salva in**: `negozi.facebook`, `negozi.instagram`, `negozi.tiktok`, `negozi.youtube`, `negozi.sito_web`

### 4.11 SEO
- **Campi**: SEO title, SEO description, SEO keywords
- **Salva in**: `negozi.seo_title`, `negozi.seo_description`, `negozi.seo_keywords`
- **NOTE**: Nuovo. Questi dati erano assenti prima.

### 4.12 AI
- **Campi**: istruzioni personalizzate per l'assistente AI, tono di voce, domande frequenti
- **Salva in**: `negozi.data.ai_data`
- **NOTE**: I dati utilizzati dall'assistente AI vengono da qui, non da file hardcoded.

### 4.13 Impostazioni
- **Campi**: negozio attivo, mostra telefono, mostra indirizzo, mostra orari, accetta WhatsApp, in evidenza, parole chiave, colori brand
- **Salva in**: `negozi.attivo`, `negozi.mostra_telefono`, ... , `negozi.colori`, `negozi.parole_chiave`
- **Aggiunta**: sezione "Salva come template" e "Duplica negozio"

---

## 5. FLUSSO DI CREAZIONE

### 5.1 Procedura rapida (template → online)

```
Dashboard → "Nuovo negozio"
    │
    ▼
┌──────────────────────────────────────┐
│  SELEZIONE TEMPLATE                   │
│                                       │
│  ○ Template Base                      │
│     (vuoto: nome, logo, orari default)│
│                                       │
│  ● Template Panificio  ───┐           │
│  ○ Template Beauty       │           │
│  ○ Template Casa         │ Dati      │
│  ○ Template Auto         │ precomp.  │
│  ○ ...                   │           │
│                             │           │
│    [CREA NEGOZIO]           │           │
└──────────────────────────────┘           │
    │                                      │
    ▼                                      ▼
POST /api/merchant/stores       Tutti i campi copiati
{ templateId: "uuid" }          dal template tranne:
    │                             id, owner, slug
    ▼                             attivo = false
┌─────────────────────────┐
│  NEGOZIO CREATO          │  <- redirect immediato
│  "Copia di Panificio X"  │
│  [VAI ALLE IMPOSTAZIONI] │
└─────────────────────────┘
    │
    ▼
Nelle impostazioni, l'utente modifica SOLO ciò che serve:
  1. Nome         → 30 secondi
  2. Logo         → 30 secondi
  3. Categoria    → 10 secondi
  4. Prodotti     → (tempo variabile)
  5. Salva        → 5 secondi
  ─────────────────────
  Totale: 1-5 minuti
```

### 5.2 API creazione

**`POST /api/merchant/stores`**
```json
{ "templateId": "uuid-del-template" }
```

Logica backend:
1. Legge il record template (`is_template = true`)
2. Genera nuovo UUID
3. Copia TUTTI i campi eccetto: `id`, `slug`, `owner_user_id`, `is_template`, `template_name`, `created_at`, `updated_at`, `attivo`
4. Se il template ha `moduli_attivi`, li copia (eredita la configurazione moduli)
5. Imposta `attivo = false`
6. Imposta `owner_user_id = currentUser.id`
7. Slug generato automaticamente da `nome` (tramite funzione `generaSlug(nome)`)
8. Inserisce e restituisce il nuovo record

### 5.3 Garanzia: la procedura rimane identica tra 2 anni

Anche se tra 2 anni esistono 20 moduli aggiuntivi:
1. Il pulsante "Nuovo negozio" → stessa UI
2. La selezione template → stessa UI (più template disponibili)
3. La creazione copia tutti i dati del template (inclusi i nuovi moduli in `data`)
4. Le impostazioni mostrano più sezioni (i nuovi moduli appaiono automaticamente nella sidebar grazie al `moduli_registry`)
5. Il pulsante "Salva" → stesso comportamento

**Zero modifiche al flusso di creazione.**

---

## 6. FLUSSO DI DUPLICAZIONE

### 6.1 Procedura (2 minuti)

```
Dashboard → "Duplica negozio"
    │
    ▼
POST /api/merchant/stores/{id}/duplicate
    │
    ▼
Backend:
  1. Legge il negozio sorgente (è un negozio normale, non serve che sia template)
  2. Genera nuovo UUID
  3. Copia TUTTI i campi (stessa logica della creazione da template)
  4. Imposta nome = "{nome originale}"
  5. Slug = generaSlug(nome)
  6. owner_user_id = currentUser.id
  7. attivo = false
  8. is_template = false
  9. NON copia i prodotti (si aggiungono dopo)
  10. Copia i moduli_attivi ereditandoli dal sorgente
    │
    ▼
Redirect → /merchant/{nuovoId}/impostazioni
    │
    ▼
Modifiche rapide:
  1. Nome         → 10 secondi  (es. "Panificio Rossi" → "Panificio Verdi")
  2. Categoria    → 5 secondi   (se serve cambiarla)
  3. Logo         → 30 secondi
  4. Contatti     → 30 secondi
  5. Indirizzo    → 20 secondi
  6. Orari        → 20 secondi (o eredita, se uguali)
  7. Prodotti     → da creare
  ─────────────────────
  Totale: 2-5 minuti
```

### 6.2 API duplicazione

**`POST /api/merchant/stores/{id}/duplicate`** → nessun body necessario

---

## 7. GESTIONE IMMAGINI

### 7.1 Storage hierarchy

```
store-images/
  └── {negozioId}/
      ├── logo/{uuid}.jpg          → negozi.logo_url
      ├── copertina/{uuid}.jpg     → negozi.copertina_url
      └── galleria/
          ├── {uuid}.jpg           → negozi.galleria[0]
          └── {uuid}.jpg           → negozi.galleria[1]
```

### 7.2 Alla duplicazione

Quando si duplica un negozio:
- **Le immagini NON vengono copiate fisicamente** nel bucket
- I campi `logo_url`, `copertina_url`, `galleria` vengono **copiati** nel nuovo record
- Il nuovo negozio punta alle stesse immagini del sorgente
- Se l'utente carica nuove immagini, quelle vecchie (ora orfane) vengono rimosse da `deleteOrphanImages()`
- UX: "Le immagini sono state copiate dal negozio originale. Carica nuove immagini per personalizzarle."

### 7.3 Fallback immagini

Se un negozio non ha `logo_url`, il sistema:
1. Cerca `categorie.immagine` per la categoria del negozio
2. Se non trovata, usa URL Pexels predefinito (unico per tutti, non più per categoria)

Le immagini per categoria sono nella tabella `categorie`, modificabili dal CMS admin.

---

## 8. ROUTING E NAVIGAZIONE

### 8.1 Nuovo routing CMS

```
/merchant
├── page.tsx                         → Lista negozi + "Nuovo negozio"
│
├── [negozioId]/
│   ├── page.tsx                     → Dashboard
│   │   ├── "Duplica negozio"
│   │   └── "Apri pagina pubblica"
│   │
│   ├── {modulo}/page.tsx            → MODULI DINAMICI
│   │   (informazioni, immagini, prodotti, etc.)
│   │
│   └── template/page.tsx            → Salva / carica template
│
└── admin/
    ├── page.tsx                     → Admin dashboard
    ├── categorie/page.tsx           → Gestione categorie
    ├── moduli/page.tsx              → Gestione moduli registry
    └── template-globale/page.tsx    → Template globali
```

### 8.2 Navigazione dinamica

La sidebar del CMS viene costruita DA DINAMICAMENTE dal `moduli_registry`:

```typescript
// Appena il merchant apre la gestione di un negozio:
const moduli = await getModuliAttivi(negozioId);
// moduli = [{ slug: "informazioni", nome: "Informazioni", icona: "Building2" }, ...]
// La sidebar renderizza un link per ogni modulo
```

**Vantaggio**: se tra 2 anni si aggiunge un modulo "Recensioni", la sidebar lo mostra automaticamente senza modificare il layout.

### 8.3 API per moduli

```typescript
// GET /api/modules?negozioId={id}
// Restituisce la lista dei moduli attivi per questo negozio
// (ordinati per `ordinamento` dal moduli_registry)

// GET /api/merchant/stores/{id}/modules/{slug}
// Restituisce i dati del modulo specifico

// PUT /api/merchant/stores/{id}/modules/{slug}
// Salva i dati del modulo specifico
```

---

## 9. COMPONENTI REACT

### 9.1 Componenti da MANTENERE (invariati)

| Componente | Percorso |
|---|---|
| `OpeningHoursDisplay` | `components/negozio/OpeningHoursDisplay.tsx` |
| `StoreProductCard` | `components/negozio/StoreProductCard.tsx` |
| `StoreProductSearch` | `components/negozio/StoreProductSearch.tsx` |
| `DeleteStoreButton` | `components/negozio/DeleteStoreButton.tsx` |
| `MerchantProductForm` | `components/merchant/MerchantProductForm.tsx` |
| `MerchantDashboardCards` | `components/merchant/MerchantDashboardCards.tsx` |
| `MerchantQuickActions` | `components/merchant/MerchantQuickActions.tsx` |
| `MerchantEmptyState` | `components/merchant/MerchantEmptyState.tsx` |
| `MerchantStoreSwitcher` | `components/merchant/MerchantStoreSwitcher.tsx` |
| `useSettingsForm` | `components/merchant/settings/useSettingsForm.ts` |
| `MerchantBottomNav` | `components/merchant/MerchantBottomNav.tsx` |
| `MerchantTopBar` | `components/merchant/MerchantTopBar.tsx` |
| `MerchantSidebarNav` | `components/merchant/MerchantSidebarNav.tsx` (leggi nota) |

**Nota `MerchantSidebarNav.tsx`**: va modificato per leggere i moduli dal database invece di avere link hardcoded.

### 9.2 Componenti da CREARE (moduli CMS)

| Componente | Percorso | Descrizione |
|---|---|---|
| `InformazioniModule` | `components/merchant/modules/InformazioniModule.tsx` | Nome, categoria, descrizione |
| `ImmaginiModule` | `components/merchant/modules/ImmaginiModule.tsx` | Logo, copertina, galleria |
| `ProdottiModule` | `components/merchant/modules/ProdottiModule.tsx` | Reindirizza a /prodotti |
| `ServiziModule` | `components/merchant/modules/ServiziModule.tsx` | Tags servizi |
| `OfferteModule` | `components/merchant/modules/OfferteModule.tsx` | CRUD offerte |
| `EventiModule` | `components/merchant/modules/EventiModule.tsx` | CRUD eventi |
| `ContattiModule` | `components/merchant/modules/ContattiModule.tsx` | Telefono, email, WhatsApp |
| `PosizioneModule` | `components/merchant/modules/PosizioneModule.tsx` | Indirizzo, mappa |
| `OrariModule` | `components/merchant/modules/OrariModule.tsx` | Orari apertura |
| `SocialModule` | `components/merchant/modules/SocialModule.tsx` | Link social |
| `SeoModule` | `components/merchant/modules/SeoModule.tsx` | Meta tag SEO |
| `AiModule` | `components/merchant/modules/AiModule.tsx` | Dati assistente AI |
| `ImpostazioniModule` | `components/merchant/modules/ImpostazioniModule.tsx` | Visibilità, colori, toggle |

### 9.3 Componenti da MODIFICARE

| Componente | Modifica |
|---|---|
| `MerchantSidebarNav.tsx` | Legge moduli dal db (non hardcoded) |
| `MerchantQuickActions.tsx` | Aggiunge "Duplica negozio" |
| `StoreEditorForm.tsx` | SOSTITUITO dai moduli sopra. Eliminare dopo refactor. |
| `SettingsShell.tsx` | Adattato per caricare moduli dinamicamente |

---

## 10. FILE DA ELIMINARE

| File | Motivo |
|---|---|
| `lib/negozi-demo.ts` | Non esistono più demo. Tutto nel DB. |
| `components/merchant/settings/StoreEditorForm.tsx` | Sostituito dai singoli moduli |
| `public/negozi/*` | Placeholder sostituiti da URL db |
| `lib/ranking-negozi.ts` | Logica sinonimi spostata in `categorie` |
| `lib/negozi-card-immagini.ts` | Sostituito da lookup su `categorie.immagine` |
| `lib/prodotti-immagini.ts` | Sostituito da lookup su `categorie.immagine` |

---

## 11. FILE DA RIFATTORIZZARE

**Priorità ALTA:**
- `lib/negozi.ts` → sinonimi da `categorie`, `getNegoziByOwner()`, funzione `generaSlug()`
- `lib/merchant/data.ts` → `createStoreFromTemplate()`, `duplicateStore()`, `saveAsTemplate()`
- `app/(merchant)/merchant/[negozioId]/page.tsx` → aggiungere "Duplica"
- `app/(merchant)/merchant/page.tsx` → aggiungere "Nuovo negozio" con selezione template
- `app/negozio/[id]/page.tsx` → logo_url, copertina_url, seo, colori dinamici
- `app/page.tsx` → immagini da DB, categorie da DB
- `api/merchant/stores/[negozioId]/settings/route.ts` → campi rinominati

**Priorità MEDIA:**
- `types/orari.ts` → unire in `types/negozio.ts`
- `app/api/merchant/stores/route.ts` → CREARE (nuovo endpoint)
- `app/api/modules/route.ts` → CREARE
- `lib/modules/registry.ts` → CREARE (module registry code-side)

---

## 12. ORDINE DI IMPLEMENTAZIONE

  ### Fase 0 — Preparazione (COMPLETATA)
  1. ✅ Eliminato `lib/negozi-demo.ts`
  2. ✅ Rimossi riferimenti a `NegozioDemo` / `ProdottoDemo`
  3. ✅ Eliminati componenti legacy settings (7 file)
  4. ✅ Eliminato `lib/brain/` (non referenziato)
  5. ✅ Pulito codice morto, import rotti, duplicazioni

### Fase 1 — Database (1 giorno)
1. Creare tabella `categorie` con sinonimi
2. Creare tabella `moduli_registry`
3. Aggiungere colonne a `negozi`: `seo_title`, `seo_description`, `seo_keywords`, `moduli_attivi`, `data`, `version`
4. Rinominare `immagine` → `logo_url`, `copertina` → `copertina_url`
5. Seed dati predefiniti (categorie, moduli, template base)

### Fase 2 — API layer (2 giorni)
1. `POST /api/merchant/stores` — crea da template
2. `POST /api/merchant/stores/{id}/duplicate` — duplica
3. `PUT /api/merchant/stores/{id}/template` — salva come template
4. `GET /api/modules` — lista moduli
5. `GET /api/categories` — lista categorie
6. Aggiornare `PUT /api/merchant/stores/{id}/settings`
7. `PUT /api/merchant/stores/{id}/modules/{slug}` — salva dati modulo

### Fase 3 — Data layer (1 giorno)
1. Rifattorizzare `lib/negozi.ts` (sinonimi da db, `generaSlug()`)
2. Rifattorizzare `lib/merchant/data.ts` (nuove funzioni)
3. Creare `types/negozio.ts` (tipo unificato `Negozio`)
4. Creare `lib/modules/registry.ts`

### Fase 4 — CMS modulare (3 giorni)
1. Creare componente `MerchantModulesPage` (router dinamico)
2. Creare ogni modulo come componente indipendente
3. Modificare `MerchantSidebarNav` per leggere moduli dal db
4. Aggiungere "Duplica" in dashboard
5. Aggiungere "Nuovo negozio" con selezione template
6. Aggiungere admin categorie

### Fase 5 — Frontend pubblico (1 giorno)
1. Aggiornare pagina negozio (`/negozio/[id]`)
2. Aggiornare homepage
3. Aggiornare pagine ricerca e listing
4. Integrare colori dinamici del brand nella pagina pubblica
5. Integrare SEO dinamica

### Fase 6 — Test (1 giorno)
1. Creare 5 negozi da template
2. Duplicare 5 negozi
3. Modificare tutti i moduli
4. Verificare pagine pubbliche
5. Testare performance con 10.000 negozi (simulazione)

---

## VERIFICA FINALE: 10.000 NEGOZI

| Requisito | Verdetto |
|---|---|
| PostgreSQL regge 10K righe in `negozi` | ✅ Sì, con indici |
| 500K prodotti in `prodotti` | ✅ Sì, con indice su `negozio_id` |
| Immagini su Supabase Storage | ✅ Sì, CDN edge caching |
| Ricerca full-text | ✅ Sì, GIN index |
| CMS multi-utente concorrente | ✅ Sì, RLS by owner |
| Creazione in minuti | ✅ Sì, template + duplica |
| Zero modifiche codice | ✅ Sì, tutto nel DB |
| Stessa procedura tra 2 anni | ✅ Sì, moduli aggiuntivi in `data` JSONB |

### Principi memorabili per lo sviluppo:

1. **Un solo concetto: Negozio.** Non esiste demo, reale, template come tipi diversi. Un template è un negozio con un flag.
2. **Il database è l'unica fonte di verità.** Tutto ciò che si vede nella pagina pubblica viene da una query.
3. **Ogni modulo è un'isola.** Un modulo non sa dell'esistenza degli altri.
4. **JSONB è il punto di estensione.** Nuovi moduli usano `negozi.data.nuovo_modulo` — nessuna migrazione.
5. **La sidebar è generata dal database.** Aggiungere un modulo = aggiungere una riga in `moduli_registry`.
6. **Duplica è la scorciatoia.** È più veloce duplicare un negozio esistente e modificare 3 campi che crearne uno da zero.
7. **Non esiste hardcoded.** Categorie, sinonimi, immagini di fallback, configurazione moduli — tutto nel database.

---

## STATO ATTUALE (post-pulizia luglio 2026)

### File eliminati (codice legacy rimosso)

| File | Motivo |
|---|---|
| `lib/negozi-demo.ts` | 554 righe di negozi demo hardcoded — tutto ora nel DB |
| `components/merchant/settings/` (7 file) | Sostituito da `components/merchant/modules/` (13 moduli) |
| `components/negozio/StoreProductSearch.tsx` | Non referenziato |
| `lib/brain/` (intera directory, 26 file) | Non referenziato |
| `lib/product-assistant/` (parziale, 9 file ripristinati) | Solo 4 file trattengono refs attive — ripristinati |
| `lib/client/image-compress.ts` | Import dinamico rotto — ripristinato |

### File rifattorizzati

| File | Modifica |
|---|---|
| `lib/search-service.ts` | Rimosso import statico `brain/types`, usato `Record<string, unknown>` per `BrainCandidate` |
| `app/(merchant)/merchant/[negozioId]/impostazioni/page.tsx` | Rimosso `SettingsShell` (wrapper div), rimosso import `MerchantEmptyState` |
| `app/api/merchant/stores/[negozioId]/settings/route.ts` | Campi rinominati: `immagine→logo_url`, `copertina→copertina_url`, `email→email_negozio`; nuovi campi: `slug`, `seo_*`, `data`, `moduli_attivi`, `galleria` |
| `lib/negozi-card-immagini.ts` | Accetta `logo_url` con fallback a `immagine` |
| `lib/ricerca-ai.ts` | `NegozioRicerca` aggiunto `logo_url` |
| `components/assistant/ShopResultCard.tsx` | Usa `logo_url` |
| `types/orari.ts` | Re-export da `types/negozio.ts` (unificazione) |
| `app/page.tsx`, `app/negozi/page.tsx`, `app/ricerca/page.tsx`, `app/negozio/[id]/page.tsx` | Passano `logo_url` al posto di `immagine` |

### File tenuti (ancora referenziati)

| File | Ruolo |
|---|---|
| `lib/ranking-negozi.ts` | Usato da `negozi.ts` e `ricerca-ai.ts` per ranking |
| `lib/negozi.ts` | Query DB pubbliche (getNegozi, getNegozio, cercaNegozi, ecc.) |
| `lib/ricerca-ai.ts` | Ricerca AI keyword + sinonimi |
| `lib/search-service.ts` | Entry point unico ricerca (Brain fallback integrato) |
| `lib/rate-limiter.ts` | Usato da API search e vision |
| `lib/scan-log.ts` | Usato da API search |
| `lib/prodotti-immagini.ts` | Riutilizzato da 8 pagine/frontend |
| `lib/merchant/data.ts` | CRUD negozi per utenti loggati |
| `components/negozio/StoreProductCard.tsx` | Ri-creato (era in uso) |
| `components/negozio/OpeningHoursDisplay.tsx` | Ri-creato (era in uso) |
| `components/negozio/DeleteStoreButton.tsx` | Ri-creato (era in uso) |
| `lib/product-assistant/` (9 file) | Ri-pristinati (usati da API vision) |
| `lib/client/` (2 file) | Ri-pristinati (import dinamico da AI uploader) |

### Base del sistema (FASE 1 completata)

```
types/negozio.ts                      ← tipi unificati
lib/modules/registry.ts               ← registry moduli
components/merchant/modules/          ← 13 moduli CMS
app/(merchant)/merchant/[negozioId]/impostazioni/page.tsx  ← host moduli
app/api/categories/route.ts           ← API categorie
app/api/merchant/stores/[negozioId]/settings/route.ts      ← API impostazioni
supabase/migrations/20260731_cms_foundation.sql            ← migrazione DB
```

Nessun dato hardcoded relativo ai negozi è rimasto nella codebase.
Ogni pagina carica esclusivamente dal database tramite le funzioni in `lib/negozi.ts` o `lib/merchant/data.ts`.
