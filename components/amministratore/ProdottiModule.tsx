"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Pencil,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import type { ProdottoAdminRow } from "@/lib/amministratore/prodotti";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";

const formatData = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

type FiltroStato = "tutti" | "attivi" | "bozze";
type FiltroFlag = "tutti" | "solo" | "no";

type Aggiornamenti = {
  attivo?: boolean;
  prodottoTipico?: boolean;
  prodottoOfferta?: boolean;
};

/**
 * Modulo /amministratore/prodotti — back office catalogo globale.
 * La pagina server carica TUTTI i prodotti reali (due query, zero N+1);
 * qui vivono ricerca, filtri (negozio, stato, categoria, tipico, offerta),
 * ordinamento e paginazione client-side, più le azioni rapide amministrative
 * (attiva/disattiva, tipico/offerta, eliminazione definitiva) protette e
 * registrate lato server. La modifica completa resta sul form condiviso del
 * venditore (/amministratore/prodotti/[productId]).
 */
export default function ProdottiModule({
  prodotti: prodottiIniziali,
}: {
  prodotti: ProdottoAdminRow[];
}) {
  const [prodotti, setProdotti] = useState(prodottiIniziali);
  const [ricerca, setRicerca] = useState("");
  const [filtroNegozio, setFiltroNegozio] = useState("tutti");
  const [filtroStato, setFiltroStato] = useState<FiltroStato>("tutti");
  const [filtroCategoria, setFiltroCategoria] = useState("tutte");
  const [filtroTipico, setFiltroTipico] = useState<FiltroFlag>("tutti");
  const [filtroOfferta, setFiltroOfferta] = useState<FiltroFlag>("tutti");
  const [ordinamento, setOrdinamento] = useState<Ordinamento>("recenti");
  const [direzione, setDirezione] = useState<"asc" | "desc">("asc");
  const [pagina, setPagina] = useState(1);
  const [perPagina, setPerPagina] = useState(10);

  const [operando, setOperando] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = useState<ProdottoAdminRow | null>(null);

  const negozi = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const prodotto of prodotti) {
      mappa.set(prodotto.negozioId, prodotto.negozioNome);
    }
    return Array.from(mappa.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  }, [prodotti]);

  const categorie = useMemo(() => {
    const insieme = new Set<string>();
    for (const prodotto of prodotti) {
      if (prodotto.categoria) insieme.add(prodotto.categoria);
    }
    return Array.from(insieme).sort((a, b) => a.localeCompare(b, "it"));
  }, [prodotti]);

  const filtrati = useMemo(() => {
    const query = ricerca.trim().toLocaleLowerCase("it");
    return prodotti.filter((prodotto) => {
      const corrispondeNegozio =
        filtroNegozio === "tutti" || prodotto.negozioId === filtroNegozio;
      const corrispondeStato =
        filtroStato === "tutti" ||
        (filtroStato === "attivi" && prodotto.attivo) ||
        (filtroStato === "bozze" && !prodotto.attivo);
      const corrispondeCategoria =
        filtroCategoria === "tutte" || prodotto.categoria === filtroCategoria;
      const corrispondeTipico =
        filtroTipico === "tutti" ||
        (filtroTipico === "solo" && prodotto.prodottoTipico) ||
        (filtroTipico === "no" && !prodotto.prodottoTipico);
      const corrispondeOfferta =
        filtroOfferta === "tutti" ||
        (filtroOfferta === "solo" && prodotto.prodottoOfferta) ||
        (filtroOfferta === "no" && !prodotto.prodottoOfferta);
      const corrispondeRicerca =
        !query ||
        [prodotto.nome, prodotto.categoria ?? "", prodotto.negozioNome].some((valore) =>
          valore.toLocaleLowerCase("it").includes(query)
        );
      return (
        corrispondeNegozio &&
        corrispondeStato &&
        corrispondeCategoria &&
        corrispondeTipico &&
        corrispondeOfferta &&
        corrispondeRicerca
      );
    });
  }, [
    filtroCategoria,
    filtroNegozio,
    filtroOfferta,
    filtroStato,
    filtroTipico,
    prodotti,
    ricerca,
  ]);

  const ordinate = useMemo(() => {
    const copia = [...filtrati];
    copia.sort((a, b) => {
      let confronto = 0;
      switch (ordinamento) {
        case "nome":
          confronto = a.nome.localeCompare(b.nome, "it", { numeric: true, sensitivity: "base" });
          break;
        case "prezzo":
          confronto = (a.prezzo ?? 0) - (b.prezzo ?? 0);
          break;
        case "negozio":
          confronto = a.negozioNome.localeCompare(b.negozioNome, "it");
          break;
        case "recenti":
        default: {
          const dataA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dataB = b.created_at ? new Date(b.created_at).getTime() : 0;
          confronto = dataA - dataB;
        }
      }
      return direzione === "asc" ? confronto : -confronto;
    });
    return copia;
  }, [direzione, filtrati, ordinamento]);

  const numeroPagine = Math.max(1, Math.ceil(ordinate.length / perPagina));
  const paginaEffettiva = Math.min(pagina, numeroPagine);
  const prodottiPagina = ordinate.slice(
    (paginaEffettiva - 1) * perPagina,
    paginaEffettiva * perPagina
  );

  function tornaAPaginaUno() {
    setPagina(1);
  }

  function cambiaOrdinamento(valore: Ordinamento) {
    if (valore === ordinamento) {
      setDirezione((precedente) => (precedente === "asc" ? "desc" : "asc"));
    } else {
      setOrdinamento(valore);
      setDirezione(valore === "recenti" ? "desc" : "asc");
    }
    tornaAPaginaUno();
  }

  async function aggiornaFlag(prodotto: ProdottoAdminRow, aggiornamenti: Aggiornamenti) {
    const chiave = `${prodotto.id}:${Object.keys(aggiornamenti).join("+")}`;
    setOperando(chiave);
    setErrore(null);
    try {
      const response = await fetch(`/api/amministratore/prodotti/${prodotto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aggiornamenti),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Operazione non riuscita.");
      }
      const applicati = (json?.data?.aggiornamenti ?? {}) as Aggiornamenti;
      setProdotti((precedenti) =>
        precedenti.map((riga) =>
          riga.id === prodotto.id
            ? {
                ...riga,
                ...(applicati.attivo !== undefined ? { attivo: applicati.attivo } : {}),
                ...(applicati.prodottoTipico !== undefined
                  ? { prodottoTipico: applicati.prodottoTipico }
                  : {}),
                ...(applicati.prodottoOfferta !== undefined
                  ? { prodottoOfferta: applicati.prodottoOfferta }
                  : {}),
              }
            : riga
        )
      );
      return true;
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
      return false;
    } finally {
      setOperando(null);
    }
  }

  async function eliminaProdotto() {
    if (!confermaElimina) return;
    const prodotto = confermaElimina;
    setOperando(`elimina:${prodotto.id}`);
    setErrore(null);
    try {
      const response = await fetch(`/api/amministratore/prodotti/${prodotto.id}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Impossibile eliminare il prodotto.");
      }
      setProdotti((precedenti) => precedenti.filter((riga) => riga.id !== prodotto.id));
      setConfermaElimina(null);
      tornaAPaginaUno();
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setOperando(null);
    }
  }

  function azzeraFiltri() {
    setRicerca("");
    setFiltroNegozio("tutti");
    setFiltroStato("tutti");
    setFiltroCategoria("tutte");
    setFiltroTipico("tutti");
    setFiltroOfferta("tutti");
    tornaAPaginaUno();
  }

  const selettoreClasse =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="space-y-5">
      {/* Conferma eliminazione definitiva */}
      {confermaElimina && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="elimina-prodotto-titolo"
            className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
              Eliminazione definitiva
            </p>
            <h2 id="elimina-prodotto-titolo" className="mt-1 text-lg font-black text-slate-900">
              Eliminare «{confermaElimina.nome}»?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Il prodotto verrà rimosso dal catalogo (e l&apos;immagine dallo
              storage). I prodotti non hanno un cestino: l&apos;azione è
              irreversibile.
            </p>
            {errore && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {errore}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={operando !== null}
                onClick={() => {
                  setConfermaElimina(null);
                  setErrore(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={operando !== null}
                onClick={() => void eliminaProdotto()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {operando !== null ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
                Elimina definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Errore operazione (banner) */}
      {errore && !confermaElimina && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errore}
          <button
            type="button"
            aria-label="Chiudi messaggio"
            onClick={() => setErrore(null)}
            className="ml-3 rounded-lg px-2 py-0.5 text-xs font-bold text-red-600 transition hover:bg-red-100"
          >
            Chiudi
          </button>
        </div>
      )}

      {/* Barra strumenti: ricerca + filtri */}
      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="relative block min-w-0 flex-1 xl:max-w-sm">
            <span className="sr-only">Cerca prodotti per nome, categoria o negozio</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={ricerca}
              onChange={(event) => {
                setRicerca(event.target.value);
                tornaAPaginaUno();
              }}
              placeholder="Cerca nome, categoria o negozio..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filtroNegozio}
              onChange={(event) => {
                setFiltroNegozio(event.target.value);
                tornaAPaginaUno();
              }}
              aria-label="Filtra per negozio"
              className={selettoreClasse}
            >
              <option value="tutti">Tutti i negozi</option>
              {negozi.map((negozio) => (
                <option key={negozio.id} value={negozio.id}>
                  {negozio.nome}
                </option>
              ))}
            </select>
            <select
              value={filtroStato}
              onChange={(event) => {
                setFiltroStato(event.target.value as FiltroStato);
                tornaAPaginaUno();
              }}
              aria-label="Filtra per stato prodotto"
              className={selettoreClasse}
            >
              <option value="tutti">Tutti gli stati</option>
              <option value="attivi">Attivi</option>
              <option value="bozze">Non attivi (bozze)</option>
            </select>
            <select
              value={filtroCategoria}
              onChange={(event) => {
                setFiltroCategoria(event.target.value);
                tornaAPaginaUno();
              }}
              aria-label="Filtra per categoria"
              className={selettoreClasse}
            >
              <option value="tutte">Tutte le categorie</option>
              {categorie.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>
            <select
              value={filtroTipico}
              onChange={(event) => {
                setFiltroTipico(event.target.value as FiltroFlag);
                tornaAPaginaUno();
              }}
              aria-label="Filtra per prodotto tipico"
              className={selettoreClasse}
            >
              <option value="tutti">Tipici: tutti</option>
              <option value="solo">Solo prodotti tipici</option>
              <option value="no">Solo prodotti normali</option>
            </select>
            <select
              value={filtroOfferta}
              onChange={(event) => {
                setFiltroOfferta(event.target.value as FiltroFlag);
                tornaAPaginaUno();
              }}
              aria-label="Filtra per prodotto in offerta"
              className={selettoreClasse}
            >
              <option value="tutti">Offerte: tutti</option>
              <option value="solo">Solo in offerta</option>
              <option value="no">Solo non in offerta</option>
            </select>
            <button
              type="button"
              onClick={() => cambiaOrdinamento(ordinamento)}
              aria-label="Cambia direzione ordinamento"
              title="Cambia direzione ordinamento"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <ChevronsUpDown className="h-4 w-4" aria-hidden />
            </button>
            <select
              value={ordinamento}
              onChange={(event) => cambiaOrdinamento(event.target.value as Ordinamento)}
              aria-label="Ordina prodotti"
              className={selettoreClasse}
            >
              <option value="recenti">Più recenti</option>
              <option value="nome">Nome</option>
              <option value="prezzo">Prezzo</option>
              <option value="negozio">Negozio</option>
            </select>
            <select
              value={perPagina}
              onChange={(event) => {
                setPerPagina(Number(event.target.value));
                tornaAPaginaUno();
              }}
              aria-label="Righe per pagina"
              className={selettoreClasse}
            >
              <option value={10}>10 righe</option>
              <option value={25}>25 righe</option>
              <option value={50}>50 righe</option>
            </select>
          </div>
        </div>
      </div>

      {/* Legenda flag gestibili */}
      <p className="px-1 text-xs leading-5 text-slate-500">
        <span className="font-bold text-slate-600">Azioni rapide:</span> i badge
        “Attivo”, “Tipico” e “In offerta” sono interruttori: un click cambia lo
        stato (la modifica completa di prezzo, descrizione e immagini resta nel
        form “Modifica”). I prodotti tipici/in offerta compaiono nelle relative
        vetrine pubbliche solo quando sono attivi.
      </p>

      {/* Elenco */}
      {prodottiPagina.length === 0 ? (
        <div className="flex flex-col items-center rounded-[2rem] border border-white/70 bg-white px-6 py-14 text-center shadow-sm">
          <Store className="h-8 w-8 text-slate-200" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            {prodotti.length === 0
              ? "Nessun prodotto nel catalogo"
              : "Nessun prodotto corrisponde ai filtri"}
          </p>
          {prodotti.length > 0 && (
            <button
              type="button"
              onClick={azzeraFiltri}
              className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
            >
              Azzera i filtri
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {prodottiPagina.map((prodotto) => {
            const occupato = operando !== null;
            const imageUrl = getProdottoImmagine({
              immagine_principale: prodotto.immaginePrincipale,
              categoria: prodotto.categoria,
            });
            return (
              <div
                key={prodotto.id}
                className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm transition hover:shadow-md sm:flex-row"
              >
                {/* Thumbnail */}
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-20 sm:w-20">
                  <Image
                    src={imageUrl}
                    alt={prodotto.nome}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                  {/* Riga superiore: nome + interruttori stato/vetrina */}
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">
                        {prodotto.nome}
                      </h3>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{prodotto.categoria ?? "Categoria non definita"}</span>
                        <span className="inline-flex items-center gap-1">
                          <Store className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                          <Link
                            href={`/amministratore/negozi/${prodotto.negozioId}`}
                            className="transition hover:text-blue-700"
                          >
                            {prodotto.negozioNome}
                          </Link>
                        </span>
                        {prodotto.created_at && (
                          <span className="hidden sm:inline">
                            {formatData.format(new Date(prodotto.created_at))}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {prodotto.negozioDemo && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                          Demo
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={occupato}
                        aria-pressed={prodotto.attivo}
                        onClick={() => void aggiornaFlag(prodotto, { attivo: !prodotto.attivo })}
                        title={
                          prodotto.attivo
                            ? "Disattiva: nasconde il prodotto dalle pagine pubbliche"
                            : "Attiva: rende il prodotto visibile pubblicamente"
                        }
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition disabled:opacity-50 ${
                          prodotto.attivo
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-500 ring-1 ring-transparent hover:bg-slate-200"
                        }`}
                      >
                        {prodotto.attivo ? "Attivo" : "Bozza"}
                      </button>
                      <button
                        type="button"
                        disabled={occupato}
                        aria-pressed={prodotto.prodottoTipico}
                        onClick={() =>
                          void aggiornaFlag(prodotto, { prodottoTipico: !prodotto.prodottoTipico })
                        }
                        title={
                          prodotto.prodottoTipico
                            ? "Rimuovi dai prodotti tipici"
                            : "Segna come prodotto tipico"
                        }
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition disabled:opacity-50 ${
                          prodotto.prodottoTipico
                            ? "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300 hover:bg-yellow-200"
                            : "border border-dashed border-yellow-300 bg-white text-yellow-700 hover:bg-yellow-50"
                        }`}
                      >
                        {prodotto.prodottoTipico ? "Tipico" : "+ Tipico"}
                      </button>
                      <button
                        type="button"
                        disabled={occupato}
                        aria-pressed={prodotto.prodottoOfferta}
                        onClick={() =>
                          void aggiornaFlag(prodotto, {
                            prodottoOfferta: !prodotto.prodottoOfferta,
                          })
                        }
                        title={
                          prodotto.prodottoOfferta
                            ? "Rimuovi dalle offerte"
                            : "Segna come prodotto in offerta"
                        }
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition disabled:opacity-50 ${
                          prodotto.prodottoOfferta
                            ? "bg-red-100 text-red-700 ring-1 ring-red-300 hover:bg-red-200"
                            : "border border-dashed border-red-300 bg-white text-red-600 hover:bg-red-50"
                        }`}
                      >
                        {prodotto.prodottoOfferta ? "In offerta" : "+ In offerta"}
                      </button>
                    </div>
                  </div>

                  {/* Riga inferiore: prezzo/qty + azioni */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">
                        € {Number(prodotto.prezzo ?? 0).toFixed(2)}
                      </span>
                      {prodotto.quantitaDisponibile != null && (
                        <span>{prodotto.quantitaDisponibile} disponibili</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/amministratore/prodotti/${prodotto.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifica
                      </Link>
                      <button
                        type="button"
                        disabled={occupato}
                        onClick={() => {
                          setConfermaElimina(prodotto);
                          setErrore(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Elimina
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginazione */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p>
          {ordinate.length === 0
            ? "Nessun risultato"
            : `Visualizzati ${(paginaEffettiva - 1) * perPagina + 1}–${Math.min(
                paginaEffettiva * perPagina,
                ordinate.length
              )} di ${ordinate.length}`}
          {ordinamento === "recenti" && direzione === "desc" && " · più recenti per primi"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagina((precedente) => Math.max(1, precedente - 1))}
            disabled={paginaEffettiva <= 1}
            aria-label="Pagina precedente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-20 text-center text-xs font-bold text-slate-600">
            Pagina {paginaEffettiva} di {numeroPagine}
          </span>
          <button
            type="button"
            onClick={() => setPagina((precedente) => Math.min(numeroPagine, precedente + 1))}
            disabled={paginaEffettiva >= numeroPagine}
            aria-label="Pagina successiva"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

type Ordinamento = "recenti" | "nome" | "prezzo" | "negozio";
