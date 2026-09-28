"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileCheck2, Loader2, X } from "lucide-react";

type Riga = {
  ordineRigaId: string;
  prodottoId: string;
  nomeProdotto: string;
  prezzoUnitario: number;
  quantitaOrdine: number;
  quantitaGiaRichiesta: number;
  quantitaDisponibile: number;
  recessoApplicabile: boolean | null;
  esclusioneCodice: string | null;
  esclusioneDettaglio: string | null;
};

type Richiesta = {
  id: string;
  numero: string;
  stato: string;
  richiestaAt: string;
  ricevutaAt: string;
  decorrenzaAt: string | null;
  termineRecessoAt: string | null;
};

type Info = {
  visibile: boolean;
  puòRichiedere: boolean;
  motivoNonDisponibile: string | null;
  ordineNumero: string;
  ordineStato: string;
  consegnataAt: string | null;
  termineRecessoAt: string | null;
  righe: Riga[];
  richiestaAttiva: Richiesta | null;
};

type Props = {
  ordineId: string;
  token?: string | null;
};

function formattaData(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function formattaEuro(value: number): string {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function etichettaStato(stato: string): string {
  switch (stato) {
    case "richiesta": return "Richiesta ricevuta";
    case "presa_in_carico": return "In gestione";
    case "istruzioni_reso": return "Istruzioni per il reso";
    case "reso_ricevuto": return "Reso ricevuto";
    case "rimborso_in_elaborazione": return "Rimborso in elaborazione";
    case "rimborsata": return "Rimborsata";
    case "rifiutata": return "Rifiutata";
    default: return "In gestione";
  }
}

export default function RecessoOrdine({ ordineId, token = null }: Props) {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [note, setNote] = useState("");
  const [quantita, setQuantita] = useState<Record<string, number>>({});

  useEffect(() => {
    let attivo = true;
    async function carica() {
      try {
        const qs = token ? \`?token=\${encodeURIComponent(token)}\` : "";
        const res = await fetch(\`/api/ordini/\${encodeURIComponent(ordineId)}/recesso\${qs}\`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as { data?: Info; error?: { message?: string } } | null;
        if (!res.ok) {
          if (res.status !== 401 && res.status !== 403 && res.status !== 404) {
            setErrore(data?.error?.message ?? "Impossibile verificare il diritto di recesso.");
          }
          return;
        }
        if (attivo && data?.data) {
          setInfo(data.data);
          const iniziali: Record<string, number> = {};
          for (const r of data.data.righe) {
            if (r.recessoApplicabile === true && r.quantitaDisponibile > 0) {
              iniziali[r.ordineRigaId] = r.quantitaDisponibile;
            }
          }
          setQuantita(iniziali);
        }
      } catch {
        if (attivo) setErrore("Errore di rete. Riprova.");
      } finally {
        if (attivo) setCaricamento(false);
      }
    }
    void carica();
    return () => {
      attivo = false;
    };
  }, [ordineId, token]);

  const righeRichiesta = useMemo(
    () =>
      Object.entries(quantita)
        .filter(([, q]) => Number.isInteger(q) && q > 0)
        .map(([ordineRigaId, q]) => ({ ordineRigaId, quantita: q })),
    [quantita]
  );

  async function invia() {
    setInvio(true);
    setErrore(null);
    try {
      const res = await fetch(\`/api/ordini/\${encodeURIComponent(ordineId)}/recesso\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token || undefined,
          righe: righeRichiesta,
          motivo: motivo.trim() || null,
          note: note.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        data?: { richiesta?: Richiesta; giaEsistente?: boolean; confermaEmail?: string };
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile registrare la richiesta di recesso.");
        return;
      }

      const richiesta = data?.data?.richiesta;
      setConferma(
        data?.data?.giaEsistente
          ? \`Esiste già una richiesta attiva (\${richiesta?.numero ?? "pratica"}).\`
          : \`Richiesta \${richiesta?.numero ?? ""} registrata. La conferma è stata presa in carico.\`
      );
      setAperto(false);
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              puòRichiedere: false,
              richiestaAttiva: richiesta ?? prev.richiestaAttiva,
            }
          : prev
      );
      router.refresh();
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setInvio(false);
    }
  }

  if (caricamento || !info?.visibile) return null;

  const righeEleggibili = info.righe.filter(
    (r) => r.recessoApplicabile === true && r.quantitaDisponibile > 0
  );

  return (
    <div className="space-y-3">
      {conferma && (
        <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {conferma}
        </p>
      )}
      {errore && (
        <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {errore}
        </p>
      )}

      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        <span className="absolute inset-y-0 left-0 w-1.5 bg-linear-to-b from-blue-500 to-cyan-500" aria-hidden />
        <div className="px-5 py-5 pl-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FileCheck2 className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Diritto di recesso</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {info.richiestaAttiva
                  ? "La tua richiesta è già stata registrata e segue il normale flusso di gestione."
                  : info.termineRecessoAt
                    ? \`Puoi trasmettere la richiesta entro il \${formattaData(info.termineRecessoAt)}.\`
                    : "Puoi trasmettere la richiesta anche prima della consegna; il termine ordinario decorre dalla consegna del prodotto."
                }
              </p>
            </div>
          </div>

          {info.richiestaAttiva ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm font-bold text-blue-800">{info.richiestaAttiva.numero} — {etichettaStato(info.richiestaAttiva.stato)}</p>
              <p className="mt-1 text-xs leading-5 text-blue-700">
                Ricevuta il {formattaData(info.richiestaAttiva.ricevutaAt)}.
              </p>
            </div>
          ) : info.puòRichiedere ? (
            <>
              <div className="mt-4 space-y-2">
                {righeEleggibili.map((r) => {
                  const q = quantita[r.ordineRigaId] ?? 0;
                  return (
                    <div key={r.ordineRigaId} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={q > 0}
                        onChange={(e) =>
                          setQuantita((prev) => ({
                            ...prev,
                            [r.ordineRigaId]: e.target.checked ? r.quantitaDisponibile : 0,
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                        aria-label={\`Seleziona \${r.nomeProdotto}\`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800">{r.nomeProdotto}</p>
                        <p className="text-xs text-slate-500">
                          {formattaEuro(r.prezzoUnitario)} € · disponibile per il recesso {r.quantitaDisponibile}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={r.quantitaDisponibile}
                        value={q}
                        onChange={(e) =>
                          setQuantita((prev) => ({
                            ...prev,
                            [r.ordineRigaId]: Math.min(r.quantitaDisponibile, Math.max(0, Number(e.target.value))),
                          }))
                        }
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm font-bold text-slate-800"
                        aria-label={\`Quantità \${r.nomeProdotto}\`}
                      />
                    </div>
                  );
                })}
              </div>

              {info.motivoNonDisponibile && (
                <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                  {info.motivoNonDisponibile}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrore(null);
                    setConferma(null);
                    setAperto(true);
                  }}
                  disabled={righeRichiesta.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-blue-800 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileCheck2 className="h-4 w-4" aria-hidden />
                  Recedere dal contratto qui
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
              {info.motivoNonDisponibile ?? "La funzione di recesso non è attualmente disponibile per questo ordine."}
            </p>
          )}

          {aperto && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !invio && setAperto(false)} />
              <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h3 className="text-base font-bold text-slate-900">Conferma il recesso</h3>
                  <button type="button" onClick={() => setAperto(false)} disabled={invio} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Chiudi">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
                  <p className="text-sm leading-6 text-slate-600">
                    Stai per trasmettere a InCittà e al venditore la dichiarazione di recesso per gli articoli selezionati. Il motivo non è obbligatorio.
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                    <strong>Ordine {info.ordineNumero}</strong><br />
                    {righeRichiesta.map((r) => {
                      const item = info.righe.find((x) => x.ordineRigaId === r.ordineRigaId);
                      return item ? <span key={r.ordineRigaId} className="block">{item.nomeProdotto} — quantità {r.quantita}</span> : null;
                    })}
                  </div>
                  <div>
                    <label htmlFor={\`recesso-motivo-\${ordineId}\`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Motivo (facoltativo)</label>
                    <textarea
                      id={\`recesso-motivo-\${ordineId}\`}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      maxLength={500}
                      rows={2}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label htmlFor={\`recesso-note-\${ordineId}\`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Nota al venditore (facoltativa)</label>
                    <textarea
                      id={\`recesso-note-\${ordineId}\`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1500}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2.5 text-xs leading-5 text-yellow-900">
                    La richiesta viene registrata con data e ora. Le istruzioni per il reso e il rimborso vengono gestite successivamente nella pratica.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
                  <button type="button" onClick={() => setAperto(false)} disabled={invio} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={() => void invia()}
                    disabled={invio || righeRichiesta.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-blue-800 hover:bg-yellow-300 disabled:opacity-50"
                  >
                    {invio ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                    {invio ? "Invio…" : "Conferma recesso"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
