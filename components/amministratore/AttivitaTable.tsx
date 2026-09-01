import { Package, Star, Store, UserRound } from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import AttivitaActionsMenu from "./AttivitaActionsMenu";
import AttivitaEliminaButton from "./AttivitaEliminaButton";

const formatData = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function BadgeStato({ attivo }: { attivo: boolean }) {
  if (attivo) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
        Attiva
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
      Disattivata
    </span>
  );
}

/**
 * Tabella Attività — centro di controllo di tutti i negozi della piattaforma.
 * Colonne: Logo, Nome, Categoria, Proprietario, Prodotti, Stato, In evidenza,
 * Data creazione, Azioni (Visualizza, Apri dashboard, Modifica, Duplica,
 * Elimina).
 */
type AggiornamentoAttivita = Partial<
  Pick<AttivitaRow, "proprietarioId" | "proprietario" | "attivo" | "in_evidenza">
>;

export default function AttivitaTable({
  attivita,
  onElimina,
  onAggiorna,
}: {
  attivita: AttivitaRow[];
  onElimina?: (id: string) => void;
  onAggiorna?: (id: string, aggiornamento: AggiornamentoAttivita) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-[0.12em] text-slate-400">
              <th className="px-5 py-3.5 font-semibold">Logo</th>
              <th className="px-5 py-3.5 font-semibold">Nome</th>
              <th className="px-5 py-3.5 font-semibold">Categoria</th>
              <th className="px-5 py-3.5 font-semibold">Proprietario</th>
              <th className="px-5 py-3.5 font-semibold">Prodotti</th>
              <th className="px-5 py-3.5 font-semibold">Stato</th>
              <th className="px-5 py-3.5 font-semibold">In evidenza</th>
              <th className="px-5 py-3.5 font-semibold">Data creazione</th>
              <th className="px-5 py-3.5 text-right font-semibold">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {attivita.map((negozio) => {
              const immagine = getNegozioCardImmagine({
                logo_url: negozio.logo_url,
                categoria: negozio.categoria,
              });
              return (
                <tr
                  key={negozio.id}
                  className="border-b border-slate-50 transition-colors last:border-0 hover:bg-yellow-50/70"
                >
                  <td className="px-5 py-4">
                    <span
                      role="img"
                      aria-label={`Logo di ${negozio.nome}`}
                      className="block h-11 w-11 overflow-hidden rounded-xl bg-slate-100 bg-cover bg-center ring-1 ring-slate-100"
                      style={{ backgroundImage: `url(${immagine})` }}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <p className="flex items-center gap-2 font-bold text-slate-800">
                      <Store className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden />
                      {negozio.nome}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                      {negozio.categoria ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {negozio.proprietario ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <UserRound className="h-3.5 w-3.5 text-slate-300" aria-hidden />
                        {negozio.proprietario}
                      </span>
                    ) : (
                      <span className="text-slate-300">Non assegnato</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 font-bold tabular-nums text-slate-700">
                      <Package className="h-3.5 w-3.5 text-slate-300" aria-hidden />
                      {negozio.prodotti}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <BadgeStato attivo={negozio.attivo} />
                  </td>
                  <td className="px-5 py-4">
                    {negozio.in_evidenza ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1 text-[11px] font-bold text-yellow-700 ring-1 ring-yellow-200">
                        <Star className="h-3 w-3" aria-hidden />
                        In evidenza
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {formatData.format(new Date(negozio.created_at))}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <AttivitaEliminaButton
                        storeId={negozio.id}
                        storeName={negozio.nome}
                        onElimina={(id) => onElimina?.(id)}
                      />
                      <AttivitaActionsMenu
                        attivita={negozio}
                        onElimina={onElimina}
                        onAggiorna={onAggiorna}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {attivita.length === 0 && (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <Store className="h-8 w-8 text-slate-200" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Nessuna attività trovata
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Prova a modificare i filtri o la ricerca.
          </p>
        </div>
      )}
    </div>
  );
}
