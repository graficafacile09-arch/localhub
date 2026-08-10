import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
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

/** Mini-riga del primo prodotto (foto + nome + q.tà × prezzo). */
function PrimaRiga({ riga, extra }: { riga: RigaOrdine; extra?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
        {riga.immagineUrl ? (
          <Image
            src={riga.immagineUrl}
            alt={riga.nomeProdotto}
            fill
            unoptimized
            className="object-cover"
            sizes="48px"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-300">
            <Package className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {riga.nomeProdotto}
        </p>
        <p className="text-xs text-slate-500">
          {Number(riga.quantita) || 1} × {formattaPrezzo(riga.prezzoUnitario)}
        </p>
      </div>
      {extra ? (
        <span className="shrink-0 text-xs font-bold text-slate-500">{extra}</span>
      ) : null}
    </div>
  );
}

/**
 * CARD ORDINE — card di lista condivisa tra Area Clienti e Area Venditore.
 * Stessa struttura, tipografia e gerarchia: la differenza è SOLO l'identità
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
  const sintesi = sintesiProdotti(righe ?? []);
  const primo = (righe ?? [])[0];
  const extraProdotti = (righe ?? []).length > 1 ? `+${(righe ?? []).length - 1}` : undefined;
  const èRitiro = modalita === "ritiro";
  const textAccent = vista === "cliente" ? "group-hover:text-teal-600" : "group-hover:text-blue-600";

  return (
    <Link
      href={href}
      className={`group block rounded-[1.75rem] border bg-white p-5 shadow-sm transition hover:shadow-md ${
        nonLetto
          ? "border-red-200 ring-1 ring-red-100"
          : "border-white/70 hover:border-blue-200"
      }`}
    >
      {/* ── Riga 1: numero + sintesi + totale ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-black tracking-wide text-slate-900">
            {numero}
          </span>
          {sintesi ? (
            <span className="truncate text-sm font-semibold text-slate-500">
              · {sintesi}
            </span>
          ) : null}
          {nonLetto && vista === "venditore" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
              Nuovo ordine
            </span>
          ) : null}
          {haReclamoAperto && vista === "venditore" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
              <AlertTriangle className="h-3 w-3" aria-hidden /> Reclamo
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-lg font-black text-slate-900">
          {formattaPrezzo(totale)}
        </span>
      </div>

      {/* ── Riga 2: identità (negozio o cliente) + data/ora ───────────────── */}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {vista === "cliente" ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <Store className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
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

      {/* ── Riga 3: prodotto (o riepilogo prodotti) ───────────────────────── */}
      <div className="mt-4 rounded-xl bg-slate-50/80 px-3.5 py-3">
        {primo ? (
          <PrimaRiga riga={primo} extra={extraProdotti} />
        ) : (
          <p className="text-xs text-slate-400">Nessun prodotto registrato.</p>
        )}
        {costoSpedizione > 0 ? (
          <p className="mt-2 border-t border-slate-200/70 pt-2 text-xs text-slate-500">
            Spedizione: {formattaPrezzo(costoSpedizione)}
          </p>
        ) : null}
      </div>

      {/* ── Riga 4: badge stato + CTA ────────────────────────────────────── */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <StatoBadge stato={stato} />
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-bold transition ${textAccent}`}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
