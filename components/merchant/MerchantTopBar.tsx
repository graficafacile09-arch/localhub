"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type MerchantTopBarProps = {
  /** Nome del negozio corrente, usato per personalizzare il titolo della dashboard */
  storeName?: string | null;
};

/**
 * Top App Bar visibile solo su mobile (< md).
 * Mostra il titolo della pagina corrente e un pulsante Indietro.
 * Su desktop non viene renderizzata.
 */
export default function MerchantTopBar({ storeName }: MerchantTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Estrae negozioId dall'URL per costruire i fallback di navigazione
  const storeId = pathname.match(/^\/merchant\/([^/]+)/)?.[1] ?? null;
  const dashboardHref = storeId ? `/merchant/${storeId}` : "/merchant";

  // Mappa path → titolo pagina
  // L'ordine conta: i pattern più specifici devono venire prima
  const title = resolveTitle(pathname, storeName);

  // Determina se siamo sulla root del merchant (nessun indietro sensato)
  const isRoot =
    pathname === "/merchant" ||
    (storeId !== null && pathname === `/merchant/${storeId}`);

  function handleBack() {
    if (isRoot) {
      // Dalla dashboard negozio torna alla selezione negozi
      if (storeId) {
        router.push("/merchant");
      }
      return;
    }
    // In tutti gli altri casi usa la history del browser
    // Se non c'è history (apertura diretta da link) torna alla dashboard
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(dashboardHref);
    }
  }

  return (
    <div
      className="sticky top-0 z-40 flex h-14 items-center border-b border-blue-900/20 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] px-2 text-white md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Pulsante indietro — 44×44px tap target */}
      <button
        type="button"
        onClick={handleBack}
        aria-label="Torna indietro"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:bg-white/20
          ${isRoot && !storeId ? "invisible" : ""}
        `}
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>

      {/* Titolo centrato — usa absolute per centrare rispetto alla barra intera */}
      <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
        <span className="max-w-[60vw] truncate text-sm font-bold tracking-tight text-white">
          {title}
        </span>
      </div>

      {/* Placeholder destra per bilanciare il layout (stessa larghezza del pulsante) */}
      <div className="ml-auto h-11 w-11 shrink-0" aria-hidden />
    </div>
  );
}

// ─── Risoluzione titolo da pathname ──────────────────────────────────────────

function resolveTitle(pathname: string, storeName?: string | null): string {
  // /merchant esatto
  if (pathname === "/merchant") return "I tuoi negozi";

  // Pattern con negozioId
  const withStore = /^\/merchant\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!withStore) return "Merchant";

  const suffix = withStore[2] ?? "";

  if (suffix === "" || suffix === "/") {
    return storeName ?? "Dashboard";
  }
  if (suffix === "/prodotti/ai") return "Aggiungi con AI";
  if (suffix === "/prodotti/nuovo") return "Nuovo prodotto";
  if (/^\/prodotti\/[^/]+$/.test(suffix)) return "Modifica prodotto";
  if (suffix === "/prodotti") return "Prodotti";
  if (suffix === "/impostazioni") return "Impostazioni";

  return storeName ?? "Merchant";
}
