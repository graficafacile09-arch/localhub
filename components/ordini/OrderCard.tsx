import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarDays,
  MapPin,
  Package,
  Store,
  Truck,
  User,
} from "lucide-react";
import type { RigaOrdine, StatoOrdine } from "@/lib/cliente/types";
import {
  etichettaModalita,
  formattaDataOraCard,
  sintesiProdotti,
} from "@/lib/cliente/ordini-format";
import { StatoBadge } from "./StatoBadge";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * CARD ORDINE — card di lista condivisa tra Area Clienti e Area Venditore.
 * Gerarchia visiva: numero+prodotto → stato → identità → riepilogo prodotto
 * → totale → azione. Stessa struttura e tipografia: cambia SOLO l'identità
 * (il cliente vede il NEGOZIO, il venditore vede il CLIENTE) e i flag
 * operativi del venditore (NUOVO ORDINE se non letto, reclamo aperto).
 * Identificazione: numero leggibile + sintesi prodotto (MAI UUID).
 */
export function OrderCard({
  href,
  numero,
  stato,
  totale,
  costoSpedizione,
  createdAt,
  modalita,
  righe,
  negozioNome,
  clienteNome,
  clienteCognome,
  nonLetto,
  haReclamoAperto,
  vista,
  ctaLabel,
}: {
  href: string;
  numero: string;
  stato: StatoOrdine;
  totale: number;
  costoSpedizione: number;
  createdAt: string;
  modalita: "ritiro" | "spedizione";
  righe: RigaOrdine[];
  negozioNome?: string;
  clienteNome?: string;
  clienteCognome?: string;
  nonLetto?: boolean;
  haReclamoAperto?: boolean;
  vista: "cliente" | "venditore";
  ctaLabel: string;
}) {
  const righeLista = righe ?? [];
  const sintesi = sintesiProdotti(righeLista);
  const primo = righeLista[0];
  const altri = righeLista.length > 1 ? righeLista.length - 1 : 0;
  const èRitiro = modalita === "ritiro";
  const accentText =
    vista === "cliente" ? "text-teal-700 group-hover:text-teal-800" : "text-blue-700 group-hover:text-blue-800";
  const accentIcon = vista === "cliente" ? "text-teal-600" : "text-blue-600";

  return (
    <Link
      href={href}
      className={`group flex h-full flex-col rounded-[1.75rem] border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        nonLetto && vista === "venditore"
          ? "border-red-200 ring-1 ring-red-100"
          : "border-white/70 hover:border-slate-200"
      }`}
    >
      {/* ── 1. Numero + prodotto ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-black tracking-wide text-slate-900">
              {numero}
            </span>
            {sintesi ? (
              <span className="truncate text-sm font-semibold text-slate-500">
                · {sintesi}
              </span>
            ) : null}
          </p>
        </div>
        <span className="shrink-0 text-xl font-black tracking-tight text-slate-900">
          {formattaPrezzo(totale)}
        </span>
      </div>

      {/* ── 2. Stato + flag ─────────────────────────────────────────────────── */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <StatoBadge stato={stato} />
        {nonLetto && vista === "venditore" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            <BellRing className="h-3 w-3" aria-hidden /> Nuovo ordine
          </span>
        ) : null}
        {haReclamoAperto && vista === "venditore" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-3 w-3" aria-hidden /> Reclamo aperto
          </span>
        ) : null}
      </div>

      {/* ── 3. Identità + data/ora ──────────────────────────────────────────── */}
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {vista === "cliente" ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <Store className={`h-3.5 w-3.5 shrink-0 ${accentIcon}`} aria-hidden />
            {negozioNome}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <User className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden />
            {clienteNome} {clienteCognome}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          {formattaDataOraCard(createdAt)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {èRitiro ? (
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          )}
          {etichettaModalita(modalita)}
        </span>
      </p>

      {/* ── 4. Riepilogo prodotto ───────────────────────────────────────────── */}
      <div className="mt-3.5 flex flex-1 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
        <div className="relative h-13 w-13 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200" style={{ height: 52, width: 52 }}>
          {primo?.immagineUrl ? (
            <Image
              src={primo.immagineUrl}
              alt={primo.nomeProdotto}
              fill
              unoptimized
              className="object-cover"
              sizes="52px"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-slate-300">
              <Package className="h-5 w-5" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">
            {primo?.nomeProdotto ?? "Nessun prodotto registrato"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {primo
              ? `${Number(primo.quantita) || 1} × ${formattaPrezzo(primo.prezzoUnitario)}`
              : "—"}
          </p>
        </div>
        {altri > 0 && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
            +{altri} altri
          </span>
        )}
      </div>

      {/* ── 5/6. Totale + azione ────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3.5">
        <div className="text-xs text-slate-400">
          {costoSpedizione > 0 ? (
            <span>+ spedizione {formattaPrezzo(costoSpedizione)}</span>
          ) : (
            <span>Consegna {etichettaModalita(modalita).toLowerCase()}</span>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-bold transition ${accentText}`}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
