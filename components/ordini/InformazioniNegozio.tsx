import Link from "next/link";
import { Store } from "lucide-react";
import { Sezione } from "./Sezione";

/**
 * Negozio — sezione condivisa del dettaglio cliente (nome + link).
 */
export function InformazioniNegozio({
  negozioNome,
  linkHref,
}: {
  negozioNome: string;
  linkHref?: string;
}) {
  return (
    <Sezione
      icon={Store}
      titolo="Negozio"
      action={
        linkHref ? (
          <Link
            href={linkHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
          >
            Visita il negozio
          </Link>
        ) : undefined
      }
    >
      <p className="text-lg font-black tracking-tight text-slate-900">{negozioNome}</p>
    </Sezione>
  );
}
