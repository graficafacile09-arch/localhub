import Link from "next/link";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import EliminaNegozioButton from "@/components/amministratore/EliminaNegozioButton";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import { getConteggiOrdiniNonLetti } from "@/lib/merchant/ordini";

/**
 * Home condivisa tra Area Venditore (default) e Area Amministratore.
 * `labelArea` personalizza solo l'etichetta visibile (es. "Area Amministratore");
 * logica, grafica ed esperienza restano identiche.
 */
export default async function MerchantHomePage({
  labelArea = "Area Venditore",
  area = "merchant",
}: {
  labelArea?: string;
  /** area="admin" → vista della dashboard amministratore (editor admin, elimina). */
  area?: "merchant" | "admin";
}) {
  const user = await requireCurrentUser("/login");
  const storesResult = await getMerchantStoresForUser(user.id);

  if (storesResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storesResult.errorMessage ?? "Esegui la migrazione SQL iniziale per attivare l'area amministratore."}
      />
    );
  }

  if (storesResult.data.length === 0) {
    // L'Area Amministratore mostra SOLO negozi reali: se non ce ne sono,
    // messaggio dedicato (nessun CTA verso /merchant, vietato all'admin).
    if (area === "admin") {
      return (
        <MerchantEmptyState
          title="Nessun negozio presente."
          description="Non ci sono negozi reali nel database. I dati demo e di test non vengono mostrati nell'Area Amministratore."
        />
      );
    }

    return (
      <div className="space-y-6">
        <MerchantEmptyState
          title="Nessun negozio trovato"
          description="Non hai ancora un negozio associato al tuo account. Se ti sei appena registrato, riprova tra qualche istante."
        />
        <div className="text-center">
          <Link
            href="/merchant/nuovo"
            className="relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 px-6 py-3 text-sm font-bold text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95"
          >
            Crea il tuo primo negozio
          </Link>
        </div>
      </div>
    );
  }

  // Badge rosso "avvisi ordini" accanto al nome di ogni negozio: il conteggio
  // degli ordini NON LETTI per negozio (best-effort, sistema letto_at esistente).
  const ordiniNonLettiPerNegozio = await getConteggiOrdiniNonLetti(
    storesResult.data.map((s) => s.id)
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          {labelArea}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
          I tuoi negozi
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Scegli il negozio da gestire. Da qui partiranno il catalogo e la pubblicazione prodotti.
        </p>
      </div>

      {/* Il CTA "+ Nuovo negozio" è solo per i venditori: l'admin gestisce
          i negozi esistenti (il wizard di creazione è in /merchant/nuovo). */}
      {area === "merchant" && (
        <div className="mb-4">
          <Link
            href="/merchant/nuovo"
            className="relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 px-4 py-2 text-xs font-bold text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95"
          >
            + Nuovo negozio
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {storesResult.data.map((store) => {
          const contenuto = (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Il mio negozio
              </p>
              <h2 className="mt-3 flex flex-wrap items-center gap-2 text-2xl font-black tracking-tight text-slate-900">
                {store.nome}
                {(ordiniNonLettiPerNegozio[store.id] ?? 0) > 0 && (
                  <span
                    className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-2 text-xs font-black text-white"
                    title={`${ordiniNonLettiPerNegozio[store.id]} ${ordiniNonLettiPerNegozio[store.id] === 1 ? "ordine non letto" : "ordini non letti"}`}
                  >
                    {ordiniNonLettiPerNegozio[store.id] > 9 ? "9+" : ordiniNonLettiPerNegozio[store.id]}
                  </span>
                )}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {store.categoria ?? "Categoria non definita"}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {store.descrizione ?? "Nessuna descrizione disponibile per questo negozio."}
              </p>
              <span className="mt-6 inline-flex rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                {area === "admin" ? "Apri editor" : "Gestisci negozio"}
              </span>
            </>
          );

          // Sessione admin → la card apre l'EDITOR amministratore
          // (/amministratore/negozi/{id}/edit, riuso dell'editor condiviso)
          // e offre l'eliminazione diretta (con conferma → Cestino).
          if (area === "admin") {
            return (
              <div
                key={store.id}
                className="relative rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm"
              >
                <div className="absolute right-4 top-4 z-10">
                  <EliminaNegozioButton storeId={store.id} storeName={store.nome} />
                </div>
                <Link
                  href={`/amministratore/negozi/${store.id}/edit`}
                  className="block transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_20px_40px_-32px_rgba(37,99,235,0.45)]"
                >
                  {contenuto}
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={store.id}
              href={`/merchant/${store.id}`}
              className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_20px_40px_-32px_rgba(37,99,235,0.45)]"
            >
              {contenuto}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
