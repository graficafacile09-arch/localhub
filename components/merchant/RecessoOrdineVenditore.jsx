import { RotateCcw } from "lucide-react";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function dataIT(value) {
  if (!value) return "In attesa";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("it-IT");
}

export default async function RecessoOrdineVenditore({ negozioId, ordineId }) {
  const db = createAdminSupabaseClient();
  const { data: pratiche } = await db
    .from("richieste_recesso")
    .select("id, numero, stato, ricevuta_at, importo_previsto, importo_rimborsato, presa_in_carico_at, istruzioni_reso_at, reso_ricevuto_at, rimborso_avviato_at, rimborsata_at, chiusa_at")
    .eq("ordine_id", ordineId)
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });

  if (!pratiche?.length) return null;

  const ids = pratiche.map((p) => p.id);
  const { data: righe } = await db
    .from("richieste_recesso_righe")
    .select("id, richiesta_id, nome_prodotto, quantita_richiesta")
    .in("richiesta_id", ids)
    .order("created_at", { ascending: true });

  return (
    <section className="rounded-[1.75rem] border border-blue-100 bg-white p-5 shadow-sm ring-1 ring-blue-50">
      <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <RotateCcw className="h-4 w-4" aria-hidden />
        </span>
        Diritto di recesso
      </p>
      <p className="mt-1 text-xs text-slate-500">Pratiche ricevute per questo ordine.</p>
      <div className="mt-4 space-y-4">
        {pratiche.map((p) => {
          const righePratica = (righe ?? []).filter((r) => r.richiesta_id === p.id);
          const fasi = [
            ["Richiesta ricevuta", p.ricevuta_at],
            ["Presa in carico", p.presa_in_carico_at],
            ["Istruzioni reso", p.istruzioni_reso_at],
            ["Reso ricevuto", p.reso_ricevuto_at],
            ["Rimborso avviato", p.rimborso_avviato_at],
            ["Rimborsata", p.rimborsata_at],
            ["Chiusa", p.chiusa_at],
          ];
          return (
            <div key={p.id} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">{p.numero}</p>
                  <p className="mt-1 text-xs text-slate-600">Stato pratica: <strong>{p.stato}</strong></p>
                </div>
                <div className="text-right text-xs text-slate-600">
                  {p.importo_previsto != null && <p>Previsto: <strong>€ {Number(p.importo_previsto).toFixed(2).replace(".", ",")}</strong></p>}
                  {p.importo_rimborsato != null && <p className="mt-1">Rimborsato: <strong>€ {Number(p.importo_rimborsato).toFixed(2).replace(".", ",")}</strong></p>}
                </div>
              </div>
              {righePratica.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {righePratica.map((r) => (
                    <div key={r.id} className="flex justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{r.nome_prodotto}</span>
                      <span className="shrink-0 text-slate-500">× {r.quantita_richiesta}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {fasi.map(([label, at]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{dataIT(at)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
