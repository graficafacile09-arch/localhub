import { Store } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import SettingsSections from "./SettingsSections";
import { requireCurrentUser } from "@/lib/auth/session";
import { getConfigPaccoSpedizione, getMerchantStoreForUser } from "@/lib/merchant/data";
import type { ConfigPaccoSpedizione } from "@/lib/merchant/types";

export default async function MerchantSettingsPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Completa la migrazione SQL prima di usare le impostazioni."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso alle impostazioni di questo negozio."
      />
    );
  }

  const store = storeResult.data;

  const configPacco: ConfigPaccoSpedizione =
    (await getConfigPaccoSpedizione(user.id, negozioId)) ?? {
      paccoPesoGrammi: null,
      paccoLunghezzaCm: null,
      paccoLarghezzaCm: null,
      paccoAltezzaCm: null,
      paccoPesoMaxGrammi: null,
    };

  return (
    <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
      <div className="space-y-6">
        {/* Header — la vetrina del commerciante, senza linguaggio tecnico */}
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 p-6 shadow-lg shadow-blue-600/20 sm:p-8">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-blue-900 shadow-md sm:h-14 sm:w-14">
              <Store className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-200">
                Gestione negozio
              </p>
              <h1 className="mt-1.5 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">
                {store.nome ?? "Il tuo negozio"}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">
                Tieni aggiornata la tua vetrina e fai conoscere il tuo negozio ai clienti.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {store.categoria && (
                  <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                    {store.categoria}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${store.attivo ? "bg-emerald-400/90 text-emerald-950" : "bg-white/15 text-white"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${store.attivo ? "bg-emerald-700" : "bg-white"}`} />
                  {store.attivo ? "Il tuo negozio è online" : "Negozio non pubblicato"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <SettingsSections storeId={negozioId} configPacco={configPacco} />
      </div>
    </div>
  );
}
