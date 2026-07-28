import Link from "next/link";
import { MapPin, Phone, MessageCircle } from "lucide-react";

export function StoreInfoCard({
  negozio,
}: {
  negozio: {
    id: string;
    nome: string;
    categoria: string | null;
    descrizione: string | null;
    indirizzo: string | null;
    telefono: string | null;
    whatsapp: string | null;
  } | null;
}) {
  if (!negozio) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <Link
        href={`/negozio/${negozio.id}`}
        className="text-sm font-bold text-slate-900 transition hover:text-blue-600"
      >
        {negozio.nome}
      </Link>
      {negozio.categoria && (
        <p className="mt-px text-[11px] font-semibold text-blue-600">
          {negozio.categoria}
        </p>
      )}
      {negozio.descrizione && (
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {negozio.descrizione}
        </p>
      )}

      <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
        {negozio.indirizzo && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
            <span>{negozio.indirizzo}</span>
          </div>
        )}
        {negozio.telefono && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-blue-500 shrink-0" />
            <span>{negozio.telefono}</span>
          </div>
        )}
      </div>
    </div>
  );
}
