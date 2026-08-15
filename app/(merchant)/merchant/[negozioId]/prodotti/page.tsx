import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Sparkles, X } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductListManager from "@/components/merchant/products/MerchantProductListManager";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import type { OrdinamentoProdotti } from "@/lib/merchant/types";

const PER_PAGINA = 12;

const ORDINAMENTI: { chiave: OrdinamentoProdotti; label: string }[] = [
  { chiave: "recenti", label: "Più recenti" },
  { chiave: "vecchi", label: "Più vecchi" },
  { chiave: "prezzo_desc", label: "Prezzo ↓" },
  { chiave: "prezzo_asc", label: "Prezzo ↑" },
  { chiave: "nome_asc", label: "Nome A→Z" },
  { chiave: "nome_desc", label: "Nome Z→A" },
];

/** Ricostruisce l'URL della pagina preservando i parametri correnti e applicando le modifiche. */
function buildUrl(
  base: string,
  correnti: Record<string, string | undefined>,
  modifiche: Record<string, string | undefined>
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...correnti, ...modifiche })) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

type Props = {
  params: Promise<{ negozioId: string }>;
  searchParams: Promise<{
    q?: string;
    stato?: string;
    ai?: string;
    esaurito?: string;
    ordina?: string;
    pagina?: string;
  }>;
};

export default async function MerchantProductsPage({ params, searchParams }: Props) {
  const { negozioId } = await params;
  const sp = await searchParams;

  // ── Parametri validati ───────────────────────────────────────────────────
  const q = sp.q?.trim() || undefined;
  const stato = sp.stato === "attivo" || sp.stato === "bozza" ? sp.stato : undefined;
  const ai = sp.ai === "1";
  const esaurito = sp.esaurito === "1";
  const ordina = ORDINAMENTI.some((o) => o.chiave === sp.ordina)
    ? (sp.ordina as OrdinamentoProdotti)
    : undefined;
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);

  const filtriAttivi = Boolean(q || stato || ai || esaurito);

  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area amministratore."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Accesso non disponibile"
        description="Questo negozio non è collegato al tuo account."
      />
    );
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId, {
    q,
    stato,
    ai: ai || undefined,
    esaurito: esaurito || undefined,
    ordina,
    pagina,
    perPagina: PER_PAGINA,
  });

  if (productsResult.errorMessage) {
    return (
      <MerchantEmptyState
        title="Impossibile caricare i prodotti"
        description={productsResult.errorMessage}
      />
    );
  }

  const products = productsResult.data;
  const totale = productsResult.total ?? products.length;
  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const paginaCorrente = Math.min(pagina, totalePagine);

  // Parametri correnti per i link (senza pagina: i cambi filtro tornano a pagina 1).
  const correnti: Record<string, string | undefined> = {
    q,
    stato,
    ai: ai ? "1" : undefined,
    esaurito: esaurito ? "1" : undefined,
    ordina,
  };
  const base = `/merchant/${negozioId}/prodotti`;

  // Pagina fuori intervallo (es. ?pagina=5 con 2 pagine): redirigi all'ultima
  // pagina valida, evitando il falso "catalogo vuoto" quando totale > 0.
  if (pagina > 1 && products.length === 0 && totale > 0) {
    redirect(buildUrl(base, correnti, { pagina: String(totalePagine) }));
  }

  return (
    <div className="space-y-6">
      {/* Header con titolo e pulsanti azione */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Catalogo merchant
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Prodotti di {storeResult.data.nome}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Gestisci il catalogo del negozio. Usa l&apos;AI per aggiungere prodotti in pochi secondi.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/merchant/${negozioId}/prodotti/ai`}
              className="btn-cta h-12 gap-2 px-5 text-sm"
            >
              <Sparkles className="h-4 w-4" />
              Aggiungi con AI
            </Link>

            <Link
              href={`/merchant/${negozioId}/prodotti/nuovo?manual=1`}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Aggiungi manualmente
            </Link>
          </div>
        </div>
      </div>

      {/* Toolbar: ricerca + filtri + ordinamento */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Ricerca testuale */}
          <form
            method="get"
            action={base}
            className="flex w-full items-center gap-2 lg:max-w-sm"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Cerca nel catalogo…"
                className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {/* Preserva gli altri filtri sulla nuova ricerca */}
            {stato && <input type="hidden" name="stato" value={stato} />}
            {ai && <input type="hidden" name="ai" value="1" />}
            {esaurito && <input type="hidden" name="esaurito" value="1" />}
            {ordina && <input type="hidden" name="ordina" value={ordina} />}
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-slate-700"
            >
              Cerca
            </button>
          </form>

          {/* Ordinamento */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Ordina
            </span>
            {ORDINAMENTI.map((o) => {
              const attivo = ordina === o.chiave || (!ordina && o.chiave === "recenti");
              return (
                <Link
                  key={o.chiave}
                  href={buildUrl(base, correnti, { ordina: o.chiave })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    attivo
                      ? "bg-blue-600 text-white shadow-sm"
                      : "border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700"
                  }`}
                >
                  {o.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Filtri stato + AI */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Filtri
          </span>
          {(
            [
              { chiave: undefined, label: "Tutti" },
              { chiave: "attivo", label: "Attivi" },
              { chiave: "bozza", label: "Bozze" },
            ] as const
          ).map((f) => {
            const attivo = stato === f.chiave;
            return (
              <Link
                key={f.label}
                href={buildUrl(base, correnti, { stato: f.chiave as string | undefined })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  attivo
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
          {(
            [
              { chiave: false, label: "Tutti" },
              { chiave: true, label: "Esauriti" },
            ] as const
          ).map((f) => {
            const attivo = esaurito === f.chiave;
            return (
              <Link
                key={f.label}
                href={buildUrl(base, correnti, { esaurito: f.chiave ? "1" : undefined })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  attivo
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
          {(
            [
              { attivo: false, label: "Tutti" },
              { attivo: true, label: "Solo AI" },
            ] as const
          ).map((f) => {
            const attivo = ai === f.attivo;
            return (
              <Link
                key={f.label}
                href={buildUrl(base, correnti, { ai: f.attivo ? "1" : undefined })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  attivo
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
                {f.label}
              </Link>
            );
          })}

          {filtriAttivi && (
            <Link
              href={base}
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-100"
            >
              <X className="h-3 w-3" aria-hidden />
              Azzera filtri
            </Link>
          )}

          <span className="ml-2 text-[11px] text-slate-400">
            {totale} {totale === 1 ? "prodotto" : "prodotti"}
          </span>
        </div>
      </div>

      {/* Banner promo AI — solo catalogo vuoto senza filtri */}
      {products.length === 0 && !filtriAttivi && (
        <div className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-600 p-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-50">
                <Sparkles className="h-3.5 w-3.5" />
                Assistente AI
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight">
                Aggiungi il primo prodotto in 30 secondi
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-100">
                Scatta una foto — l&apos;AI riconosce il prodotto, compila titolo, descrizione, categoria e prezzo in automatico.
              </p>
            </div>
            <Link
              href={`/merchant/${negozioId}/prodotti/ai`}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-2xl bg-white px-6 text-sm font-bold text-blue-700 shadow-md transition hover:bg-blue-50"
            >
              <Sparkles className="h-4 w-4" />
              Prova l&apos;AI
            </Link>
          </div>
        </div>
      )}

      {/* Lista prodotti o empty state */}
      {products.length === 0 ? (
        filtriAttivi ? (
          <MerchantEmptyState
            title="Nessun prodotto trovato"
            description="Nessun prodotto corrisponde ai filtri selezionati."
            action={
              <Link
                href={base}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                Azzera filtri
              </Link>
            }
          />
        ) : (
          <MerchantEmptyState
            title="Catalogo ancora vuoto"
            description="Aggiungi il primo prodotto tramite AI oppure manualmente."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href={`/merchant/${negozioId}/prodotti/ai`}
                  className="btn-cta h-11 gap-2 px-5 text-sm"
                >
                  <Sparkles className="h-4 w-4" />
                  Aggiungi con AI
                </Link>
                <Link
                  href={`/merchant/${negozioId}/prodotti/nuovo?manual=1`}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Aggiungi manualmente
                </Link>
              </div>
            }
          />
        )
      ) : (
        <>
          <MerchantProductListManager
            negozioId={negozioId}
            products={products}
            basePath={`/merchant/${negozioId}/prodotti`}
          />

          {/* Paginazione */}
          {totalePagine > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-white/70 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-slate-500">
                Pagina {paginaCorrente} di {totalePagine} · {totale}{" "}
                {totale === 1 ? "prodotto" : "prodotti"}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={paginaCorrente > 1 ? buildUrl(base, correnti, { pagina: String(paginaCorrente - 1), ordina: ordina ?? "recenti" }) : base}
                  aria-disabled={paginaCorrente <= 1}
                  className={`inline-flex h-9 items-center justify-center rounded-xl border px-3.5 text-xs font-semibold transition ${
                    paginaCorrente <= 1
                      ? "pointer-events-none border-slate-100 text-slate-300"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
                  }`}
                >
                  ← Precedente
                </Link>
                <Link
                  href={paginaCorrente < totalePagine ? buildUrl(base, correnti, { pagina: String(paginaCorrente + 1), ordina: ordina ?? "recenti" }) : base}
                  aria-disabled={paginaCorrente >= totalePagine}
                  className={`inline-flex h-9 items-center justify-center rounded-xl border px-3.5 text-xs font-semibold transition ${
                    paginaCorrente >= totalePagine
                      ? "pointer-events-none border-slate-100 text-slate-300"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
                  }`}
                >
                  Successiva →
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
