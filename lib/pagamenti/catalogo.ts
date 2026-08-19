/**
 * PAYMENT METHOD CATALOG — metodi di pagamento SUPPORTATI da InCittà.
 *
 * Questa è l'UNICA fonte statica dei metodi che la piattaforma mostra al
 * cliente, separata dalla disponibilità reale del singolo negozio.
 *
 *   - CATALOGO (qui): cosa InCittà SUPPORTA → sempre mostrato a Buy-Now e
 *     Checkout, indipendentemente dalla configurazione del negozio.
 *   - DISPONIBILITÀ (lib/pagamenti/config.ts → isProviderProntoPerNegozio):
 *     se il negozio può DAVVERO processare il metodo (gateway configurato,
 *     attivo e con webhook secret). Un metodo supportato ma non configurato
 *     resta visibile come "non disponibile", mai rimosso dal catalogo.
 *
 * Regole:
 *   - bonifico NON richiede alcun gateway online → sempre disponibile;
 *   - carta/paypal/klarna richiedono il rispettivo gateway configurato;
 *   - nessun fallback automatico tra metodi: la scelta è esplicita e il
 *     server rifiuta (fail-closed) un metodo non realmente disponibile.
 *
 * NESSUN segreto, NESSUNA credenziale, NESSUN accesso al DB in questo file:
 * è un catalogo statico puro (safe da importare lato client e server).
 */

export type MetodoPagamento = "carta" | "paypal" | "klarna" | "scalapay" | "bonifico";

export type VoceCatalogoMetodo = {
  metodo: MetodoPagamento;
  /** Etichetta mostrata al cliente. */
  etichetta: string;
  /** Nome breve (es. "Carta") usato nei messaggi di indisponibilità e nelle alternative. */
  nomeBreve: string;
  /** Descrizione mostrata al cliente. */
  descrizione: string;
  /**
   * Provider gateway associato (null per i metodi senza gateway online come
   * bonifico). Per i metodi gateway è il provider passato a
   * isProviderProntoPerNegozio / registry / creaSessionePagamentoPerOrdine.
   */
  provider: "stripe" | "paypal" | "klarna" | "scalapay" | null;
  /** True se il metodo richiede un gateway online configurato per essere "disponibile". */
  richiedeGateway: boolean;
};

/**
 * Catalogo dei metodi di pagamento supportati dalla piattaforma, in ordine
 * di visualizzazione canonico (uguale per Buy-Now e Checkout).
 */
export const CATALOGO_METODI_PAGAMENTO: readonly VoceCatalogoMetodo[] = [
  {
    metodo: "carta",
    etichetta: "Carta di credito/debito",
    nomeBreve: "Carta",
    descrizione: "Pagamento sicuro con Stripe (carte principali).",
    provider: "stripe",
    richiedeGateway: true,
  },
  {
    metodo: "paypal",
    etichetta: "PayPal",
    nomeBreve: "PayPal",
    descrizione: "Paga con il tuo conto PayPal o con una carta.",
    provider: "paypal",
    richiedeGateway: true,
  },
  {
    metodo: "klarna",
    etichetta: "Klarna",
    nomeBreve: "Klarna",
    descrizione: "Dividi il tuo acquisto in 3 rate, se disponibile.",
    provider: "klarna",
    richiedeGateway: true,
  },
  {
    metodo: "scalapay",
    etichetta: "Scalapay",
    nomeBreve: "Scalapay",
    descrizione: "Dividi il tuo acquisto in 3 rate con Scalapay.",
    provider: "scalapay",
    richiedeGateway: true,
  },
  {
    metodo: "bonifico",
    etichetta: "Bonifico bancario",
    nomeBreve: "Bonifico",
    descrizione: "Pagamento da concordare direttamente con il negozio.",
    provider: null,
    richiedeGateway: false,
  },
] as const;

/** Voce di catalogo per un metodo (case-sensitive, undefined se non supportato). */
export function voceCatalogoMetodo(metodo: string): VoceCatalogoMetodo | undefined {
  return CATALOGO_METODI_PAGAMENTO.find((v) => v.metodo === metodo);
}

/** True se il metodo è nel catalogo supportato dalla piattaforma. */
export function isMetodoSupportato(metodo: string): metodo is MetodoPagamento {
  return CATALOGO_METODI_PAGAMENTO.some((v) => v.metodo === metodo);
}
