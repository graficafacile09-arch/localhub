/**
 * LocalHub Assistant — ShopResultCard
 *
 * Card negozio mostrata nei risultati dell'assistente.
 * Design coerente con le card della pagina /ricerca.
 *
 * @module components/assistant/ShopResultCard
 */

import Link from "next/link";
import { ExternalLink, MapPin, MessageCircle, Navigation } from "lucide-react";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import type { NegozioRicerca } from "@/lib/ricerca-ai";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface ShopResultCardProps {
  negozio: NegozioRicerca;
  /** Posizione 1-based nella lista (usata come proxy del punteggio) */
  rank: number;
}

// ─── Helper: costruisce URL WhatsApp ─────────────────────────────────────────

function buildWhatsAppUrl(telefono: string, nomeNegozio: string): string {
  // Rimuove spazi, trattini e parentesi; aggiunge prefisso 39 se numero italiano
  const digits = telefono.replace(/[\s\-().+]/g, "");
  const number = digits.startsWith("39") ? digits : `39${digits}`;
  const msg = encodeURIComponent(
    `Ciao! Ho trovato il vostro negozio "${nomeNegozio}" su LocalHub e vorrei avere informazioni.`
  );
  return `https://wa.me/${number}?text=${msg}`;
}

// ─── Helper: costruisce URL Google Maps ──────────────────────────────────────

function buildMapsUrl(indirizzo: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ShopResultCard({ negozio, rank }: ShopResultCardProps) {
  const imageUrl = getNegozioCardImmagine({
    immagine: negozio.immagine,
    categoria: negozio.categoria,
  });

  // Score visivo: 1° = 98, 2° = 95, 3° = 91 … decresce di ~3 per posizione
  const scoreDisplay = Math.max(60, 98 - (rank - 1) * 3);

  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-slate-200/70 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(37,99,235,0.14)]">
      {/* ── Immagine ─────────────────────────────────────────────────────────── */}
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-blue-100 via-cyan-50 to-amber-50">
        <div
          role="img"
          aria-label={`Fotografia di ${negozio.nome}`}
          className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
        {/* Overlay sfumato */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />

        {/* Badge categoria */}
        {negozio.categoria && (
          <div className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700 shadow-sm backdrop-blur-sm ring-1 ring-white/80">
            {negozio.categoria}
          </div>
        )}

        {/* Badge punteggio */}
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-2.5 py-1 text-[11px] font-black text-gray-900 shadow-sm backdrop-blur-sm">
          <span aria-hidden>★</span>
          <span>{scoreDisplay}%</span>
        </div>
      </div>

      {/* ── Contenuto ────────────────────────────────────────────────────────── */}
      <div className="p-4">
        {/* Nome */}
        <h3 className="line-clamp-1 text-base font-black tracking-tight text-slate-950">
          {negozio.nome}
        </h3>

        {/* Descrizione */}
        {negozio.descrizione && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-500">
            {negozio.descrizione}
          </p>
        )}

        {/* Indirizzo */}
        {negozio.indirizzo && (
          <div className="mt-2 flex items-start gap-1.5 text-[13px] text-slate-600">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden />
            <span className="line-clamp-1">{negozio.indirizzo}</span>
          </div>
        )}

        {/* ── Pulsanti ─────────────────────────────────────────────────────── */}
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Apri scheda */}
          <Link
            href={`/negozio/${negozio.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition hover:brightness-110"
            aria-label={`Apri la scheda di ${negozio.nome}`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            Apri scheda
          </Link>

          {/* Indicazioni */}
          {negozio.indirizzo && (
            <a
              href={buildMapsUrl(negozio.indirizzo)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
              aria-label={`Indicazioni stradali per ${negozio.nome}`}
            >
              <Navigation className="h-3 w-3" aria-hidden />
              Indicazioni
            </a>
          )}

          {/* WhatsApp */}
          {negozio.telefono && (
            <a
              href={buildWhatsAppUrl(negozio.telefono, negozio.nome)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
              aria-label={`Contatta ${negozio.nome} su WhatsApp`}
            >
              <MessageCircle className="h-3 w-3" aria-hidden />
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
