import { RotateCcw } from "lucide-react";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function dataIT(value) {
  if (!value) return "In attesa";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("it-IT");
}

function euro(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

export default async function RecessoOrdineAdmin({ ordineId }) {
  const db = createAdminSupabaseClient();
  const { data: pratiche } = await db
    .from("richieste_recesso")
    .select("id, numero, stato, cliente_nome, cliente_cognome, cliente_email, venditore_denominazione_legale, venditore_nome_commerciale, ricevuta_at, presa_in_carico_at, istruzioni_reso_at, reso_ricevuto_at, rimborso_avviato_at, rimborsata_at, chiusa_at, importo_previsto, importo_rimborsato, rimborso_operazione_id, rifiuto_codice, rifiuto_nota")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: false });

  if (!pratiche?.length) return null;

  const ids = pratiche.map((p) => p.id);
  const { data: righe } = await db
    .from("richieste_recesso_righe")
    .select("id, richiesta_id, nome_prodotto, quantita_richiesta")
    .in("richiesta_id", ids)
    .order("created_at", { ascending: true });

  const { data: eventi } = await db
    .from("richieste_recesso_eventi")
    .select("id, richiesta_id, tipo, stato_precedente, stato_nuovo, messaggio, created_at")
    .in("richiesta_id", ids)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <section className="rounded-[1.75rem] border border-blue-100 bg-white p-5 shadow-sm ring-1 ring-blue-50">
      <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <RotateCcw className="h-4 w-4" aria-hidden />
        </span>
        Gestione recesso
      </p>
      <p className="mt-1 text-xs text-slate-500">Supervisione amministrativa della pratica e del relativo audit trail.</p>

      <div className="mt-4 space-y-4">
        {pratiche.map((p) => {
          const righePratica = (righe ?? []).filter((r) => r.richiesta_id === p.id);
          const eventiPratica = (eventi ?? []).filter((e) => e.richiesta_id === p.id);

          return (
            <div key={p.id} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">{p.numero}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Cliente: <strong>{p.cliente_nome} {p.cliente_cognome}</strong>
                    {p.cliente_email ? <> · {p.cliente_email}</> : null}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Venditore: <strong>{p.venditore_nome_commerciale || p.venditore_denominazione_legale || "—"}</strong>
                  </p>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <p>Stato: <strong>{p.stato}</strong></p>
                  {p.importo_previsto != null && <p className="mt-1">Previsto: <strong>€ {euro(p.importo_previsto)}</strong></p>}
                  {p.importo_rimborsato != null && <p className="mt-1">Rimborsato: <strong>€ {euro(p.importo_rimborsato)}</strong></p>}
                  {p.rimborso_operazione_id ? <p className="mt-1 break-all">Operazione rimborso: {p.rimborso_operazione_id}</p> : null}
                </div>
              </div>

              {righePratica.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {righePratica.map((r) => (
                    <div key={r.id} className="flex justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{r.nome_prodotto}</span>
                      <span className="shrink-0 text-slate-500">× {r.quantita_richiesta}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {p.rifiuto_codice || p.rifiuto_nota ? (
                <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <strong>Rifiuto:</strong> {p.rifiuto_codice || "—"}{p.rifiuto_nota ? <> · {p.rifiuto_nota}</> : null}
                </div>
              ) : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Ricevuta", p.ricevuta_at],
                  ["Presa in carico", p.presa_in_carico_at],
                  ["Istruzioni reso", p.istruzioni_reso_at],
                  ["Reso ricevuto", p.reso_ricevuto_at],
                  ["Rimborso avviato", p.rimborso_avviato_at],
                  ["Rimborsata", p.rimborsata_at],
                  ["Chiusa", p.chiusa_at],
                ].map(([label, at]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{dataIT(at)}</p>
                  </div>
                ))}
              </div>

              {eventiPratica.length > 0 ? (
                <details className="mt-4 rounded-xl border border-slate-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">
                    Audit trail ({eventiPratica.length} eventi)
                  </summary>
                  <div className="divide-y divide-slate-100 px-3">
                    {eventiPratica.map((e) => (
                      <div key={e.id} className="py-2 text-xs">
                        <p className="font-semibold text-slate-700">
                          {e.stato_precedente || "—"} → {e.stato_nuovo || "—"} · {e.tipo}
                        </p>
                        <p className="mt-0.5 text-slate-500">{dataIT(e.created_at)}{e.messaggio ? <> · {e.messaggio}</> : null}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
