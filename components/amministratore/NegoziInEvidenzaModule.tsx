"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, Loader2, MapPin, Star, Store, Tags } from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";
import AttivitaToolbar from "./AttivitaToolbar";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";

const normalizza = (testo: string) => testo.trim().toLowerCase();

function BadgeStato({ attivo }: { attivo: boolean }) {
  if (attivo) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
        Attivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
      Disattivato
    </span>
  );
}

function BadgeEvidenza({ inEvidenza }: { inEvidenza: boolean }) {
  if (!inEvidenza) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 text-[11px] font-bold text-yellow-700 ring-1 ring-yellow-200">
      <Star className="h-3 w-3" aria-hidden />
      In evidenza
    </span>
  );
}

/**
 * Modulo "Negozi in evidenza": selezione dei negozi mostrati nella home
 * pubblica. Riusa il flag in_evidenza del negozio e l'API amministratore
 * esistente (PATCH /api/amministratore/attivita/:id con { in_evidenza }).
 */
export default function NegoziInEvidenzaModule({
  attivita,
  categorie,
}: {
  attivita: AttivitaRow[];
  categorie: string[];
}) {
  const [ricerca, setRicerca] = useState("");
  const [categoria, setCategoria] = useState("tutte");
  const [evidenza, setEvidenza] = useState<Map<string, boolean>>(
    () => new Map(attivita.map((n) => [n.id, n.in_evidenza]))
  );
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [errore, setErrore] = useState<string | null>(null);

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);
    return attivita
      .filter((riga) => {
        if (categoria !== "tutte" && riga.categoria !== categoria) return false;
        if (termine) {
          const nelTesto = [riga.nome, riga.categoria, riga.slug]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!nelTesto.includes(termine)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aEv = evidenza.get(a.id) ?? a.in_evidenza;
        const bEv = evidenza.get(b.id) ?? b.in_evidenza;
        if (aEv !== bEv) return aEv ? -1 : 1;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  }, [attivita, ricerca, categoria, evidenza]);

  const inEvidenzaCount = useMemo(
    () =>
      Array.from(evidenza.values()).filter(Boolean).length,
    [evidenza]
  );

  const cambiaEvidenza = useCallback(
    async (negozio: AttivitaRow) => {
      const attuale = evidenza.get(negozio.id) ?? negozio.in_evidenza;
      const prossimo = !attuale;
      setErrore(null);
      setSalvando((prev) => new Set(prev).add(negozio.id));
      try {
        const res = await fetch(`/api/amministratore/attivita/${negozio.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ in_evidenza: prossimo }),
        });
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "Impossibile aggiornare l'attività.");
        }
        setEvidenza((prev) => new Map(prev).set(negozio.id, prossimo));
      } catch (caught) {
        setErrore(
          caught instanceof Error ? caught.message : "Errore sconosciuto."
        );
      } finally {
        setSalvando((prev) => {
          const next = new Set(prev);
          next.delete(negozio.id);
          return next;
        });
      }
    },
    [evidenza]
  );

  return (
    <div className="space-y-5">
      <div className="card p-6 md:p-8">
        <nav aria-label="Percorso" className="mb-5">
          <button
            type="button"
            onClick={() => (window.location.href = "/amministratore")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Torna al pannello
          </button>
        </nav>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-yellow-50 text-yellow-600 ring-1 ring-yellow-100">
            <Star className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-yellow-700">
              Homepage InCittà
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Negozi in evidenza
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Scegli i negozi da mettere in evidenza nella home di InCittà. I
              negozi selezionati compaiono nella sezione &ldquo;In evidenza&rdquo;
              della homepage pubblica.
            </p>
          </div>
        </div>
      </div>

      <AttivitaToolbar
        ricerca={ricerca}
        onRicerca={setRicerca}
        categoria={categoria}
        categorie={categorie}
        onCategoria={setCategoria}
      />

      {errore && (
        <div className="rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          {errore}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm font-black text-slate-700">
          {visibili.length} {visibili.length === 1 ? "negozio" : "negozi"}
          {inEvidenzaCount > 0 && (
            <span className="ml-2 font-semibold text-yellow-700">
              · {inEvidenzaCount} in evidenza
            </span>
          )}
        </p>
        {(ricerca || categoria !== "tutte") && (
          <button
            type="button"
            onClick={() => {
              setRicerca("");
              setCategoria("tutte");
            }}
            className="text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {visibili.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <Store className="h-10 w-10 text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">
            Nessun negozio trovato
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            Prova a modificare la ricerca o il filtro categoria.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {visibili.map((negozio) => {
            const immagine = getNegozioCardImmagine({
              logo_url: negozio.logo_url,
              categoria: negozio.categoria,
            });
            const inEvidenza = evidenza.get(negozio.id) ?? negozio.in_evidenza;
            const caricamento = salvando.has(negozio.id);
            return (
              <article
                key={negozio.id}
                className={`flex flex-col rounded-3xl border bg-white p-5 shadow-sm transition ${
                  inEvidenza
                    ? "border-yellow-200 ring-1 ring-yellow-100"
                    : "border-white/70 hover:shadow-md"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span
                    role="img"
                    aria-label={`Logo di ${negozio.nome}`}
                    className="block h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 bg-cover bg-center ring-1 ring-slate-100"
                    style={{ backgroundImage: `url(${immagine})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black tracking-tight text-slate-900">
                        {negozio.nome}
                      </h2>
                      <BadgeEvidenza inEvidenza={inEvidenza} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {negozio.categoria && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                          <Tags className="h-3 w-3" aria-hidden />
                          {negozio.categoria}
                        </span>
                      )}
                      <BadgeStato attivo={negozio.attivo} />
                    </div>

                    {negozio.citta && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {negozio.citta}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => cambiaEvidenza(negozio)}
                    disabled={caricamento}
                    className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition ${
                      inEvidenza
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-yellow-500 text-white hover:bg-yellow-600"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {caricamento ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Star
                        className="h-4 w-4 shrink-0"
                        aria-hidden
                        fill={inEvidenza ? "currentColor" : "none"}
                      />
                    )}
                    {inEvidenza
                      ? "Rimuovi da evidenza"
                      : "Metti in evidenza"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-3xl border border-yellow-100 bg-yellow-50/60 px-5 py-4 text-sm text-yellow-900">
        <p className="leading-6">
          <span className="font-bold">Homepage:</span> i negozi attivati
          compaiono subito nella sezione &ldquo;⭐ Negozi in evidenza&rdquo;
          della home pubblica (stessa fonte: flag in evidenza del negozio).
        </p>
      </div>
    </div>
  );
}
