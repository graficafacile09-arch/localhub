"use client";

import Link from "next/link";
import {
  LayoutList,
  Settings,
  Building2,
  Image as ImageIcon,
  Sparkles,
  CalendarCheck,
  Store,
} from "lucide-react";
import MetodiPagamentoCard from "./MetodiPagamentoCard";

/**
 * Azioni rapide della Dashboard negozio.
 *
 * Le card puntano alle sezioni/blocchi specifici del nuovo editor
 * (`/merchant/:id/edit?step=…&block=…`), così ogni voce apre direttamente
 * il blocco giusto invece di una pagina generica. Le destinazioni concrete:
 * - Informazioni      → 01 Attività (blocco identità);
 * - Foto               → 03 Presentazione (blocco presentazione);
 * - Prodotti           → 04 Catalogo e servizi (blocco prodotti) / gestione catalogo;
 * - Servizi            → 04 Catalogo e servizi (blocco servizi strutturati);
 * - Come vendi         → 05 Vendita e prenotazioni (blocco commerciale);
 * - Prenotazioni       → 05 Vendita e prenotazioni (blocco prenotazioni);
 * - Impostazioni negozio → pagina canonica /impostazioni.
 */
const azioni = [
  {
    key: "informazioni",
    title: "Informazioni",
    description: "Nome, categoria e descrizione.",
    icon: Building2,
    href: (storeId: string) => `/merchant/${storeId}/edit?step=attivita&block=identita`,
  },
  {
    key: "foto",
    title: "Foto del negozio",
    description: "Logo, copertina e galleria.",
    icon: ImageIcon,
    href: (storeId: string) => `/merchant/${storeId}/edit?step=presentazione&block=presentazione`,
  },
  {
    key: "prodotti",
    title: "Gestisci prodotti",
    description: "Vedi e modifica il catalogo.",
    icon: LayoutList,
    href: (storeId: string) => `/merchant/${storeId}/edit?step=catalogo&block=catalogo-prodotti`,
  },
  {
    key: "servizi",
    title: "Servizi offerti",
    description: "I servizi che offri ai clienti.",
    icon: Sparkles,
    href: (storeId: string) => `/merchant/${storeId}/edit?step=catalogo&block=servizi-strutturati`,
  },
  {
    key: "come-vendi",
    title: "Come vendi",
    description: "Ritiro, consegna o spedizione.",
    icon: Store,
    href: (storeId: string) => `/merchant/${storeId}/edit?step=vendita&block=vendita-commerciale`,
  },
  {
    key: "prenotazioni",
    title: "Agenda",
    description: "Appuntamenti dei clienti.",
    icon: CalendarCheck,
    href: (storeId: string) => `/merchant/${storeId}/edit?step=vendita&block=prenotazioni`,
  },
];

export default function MerchantQuickActions({ storeId }: { storeId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {azioni.map((action) => {
        const Icon = action.icon;

        return (
          <Link
            key={action.key}
            href={action.href(storeId)}
            className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-100">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                {action.title}
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                {action.description}
              </p>
            </div>
          </Link>
        );
      })}

      {/* Impostazioni negozio — stessa destinazione della sidebar (una sola voce) */}
      <Link
        href={`/merchant/${storeId}/impostazioni`}
        className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-700">
          <Settings className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            Impostazioni negozio
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Dati, foto, contatti, vendita e spedizioni.
          </p>
        </div>
      </Link>

      {/* Metodo di pagamento — card di stato con link alla route Pagamenti */}
      <MetodiPagamentoCard storeId={storeId} />
    </div>
  );
}