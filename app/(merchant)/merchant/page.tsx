import Link from "next/link";
import { redirect } from "next/navigation";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";

/**
 * Home condivisa tra Area Commerciante (default) e Area Amministratore.
 * `labelArea` personalizza solo l'etichetta visibile (es. "Area Amministratore");
 * logica, grafica ed esperienza restano identiche.
 */
export default async function MerchantHomePage({
  labelArea = "Area Commerciante",
  area = "merchant",
}: {
  labelArea?: string;
  /** area="admin" → vista della dashboard amministratore (nessun link /merchant). */
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

  // SOLO la sessione merchant può entrare nelle pagine /merchant/*: per
  // l'admin area la dashboard è un elenco informativo (evita il loop
  // /amministratore → /merchant/{id} → /amministratore).
  if (storesResult.data.length === 1 && area === "merchant") {
    redirect(`/merchant/${storesResult.data[0].id}`);
  }

  if (storesResult.data.length === 0) {
    return (
      <div className="space-y-6">
        <MerchantEmptyState
          title="Nessun negozio trovato"
          description="Non hai ancora un negozio associato al tuo account. Se ti sei appena registrato, riprova tra qualche istante."
        />
        <div className="text-center">
          <Link
            href="/merchant/nuovo"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Crea il tuo primo negozio
          </Link>
        </div>
      </div>
    );
  }

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

      <div className="mb-4">
        <Link
          href="/merchant/nuovo"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
        >
          + Nuovo negozio
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {storesResult.data.map((store) => {
          const contenuto = (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Il mio negozio
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">
                {store.nome}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {store.categoria ?? "Categoria non definita"}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {store.descrizione ?? "Nessuna descrizione disponibile per questo negozio."}
              </p>
              <span className="mt-6 inline-flex rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                {area === "admin" ? "Vedi scheda pubblica" : "Gestisci negozio"}
              </span>
            </>
          );

          // La sessione admin non può aprire /merchant/*: le card non sono
          // link (la scheda pubblica si raggiunge dall'Area Admin/Attività).
          if (area === "admin") {
            return (
              <div
                key={store.id}
                className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm"
              >
                {contenuto}
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
