"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronLeft,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import type { CategoriaAdmin } from "@/lib/amministratore/categorie-queries";

const normalizza = (testo: string) => testo.trim().toLowerCase();

type CategoriaForm = {
  nome: string;
  slug: string;
  sinonimi: string;
};

export default function CategorieModule({ categorie }: { categorie: CategoriaAdmin[] }) {
  const [ricerca, setRicerca] = useState("");
  const [locali, setLocali] = useState<CategoriaAdmin[]>(categorie);
  const [inModifica, setInModifica] = useState<CategoriaAdmin | null>(null);
  const [creazione, setCreazione] = useState(false);
  const [form, setForm] = useState<CategoriaForm>({ nome: "", slug: "", sinonimi: "" });
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);
    return locali
      .filter((categoria) => {
        if (!termine) return true;
        const testo = [categoria.nome, categoria.slug, ...(categoria.sinonimi ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return testo.includes(termine);
      })
      .sort((a, b) => {
        const utA = (a.negozi ?? 0) > 0 ? 1 : 0;
        const utB = (b.negozi ?? 0) > 0 ? 1 : 0;
        if (utA !== utB) return utB - utA;
        return a.ordine - b.ordine;
      });
  }, [locali, ricerca]);

  const usate = locali.filter((c) => (c.negozi ?? 0) > 0).length;

  const apriCreazione = useCallback(() => {
    setErrore(null);
    setForm({ nome: "", slug: "", sinonimi: "" });
    setInModifica(null);
    setCreazione(true);
  }, []);

  const apriModifica = useCallback((categoria: CategoriaAdmin) => {
    setErrore(null);
    setCreazione(false);
    setForm({
      nome: categoria.nome,
      slug: categoria.slug,
      sinonimi: (categoria.sinonimi ?? []).join(", "),
    });
    setInModifica(categoria);
  }, []);

  const chiudi = useCallback(() => {
    setErrore(null);
    setCreazione(false);
    setInModifica(null);
  }, []);

  const validaForm = useCallback((): string | null => {
    if (!form.nome.trim()) return "Il nome della categoria è obbligatorio.";
    if (!form.slug.trim()) return "Lo slug è obbligatorio.";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug.trim().toLowerCase())) {
      return "Slug non valido: usa solo minuscole, numeri e trattini (es. panificio, tech-elettronica).";
    }
    return null;
  }, [form]);

  const salva = useCallback(async () => {
    setErrore(null);
    const validation = validaForm();
    if (validation) {
      setErrore(validation);
      return;
    }
    setSalvando(true);
    try {
      const sinonimi = form.sinonimi
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = { nome: form.nome.trim(), slug: form.slug.trim().toLowerCase(), sinonimi };

      const url = inModifica
        ? `/api/amministratore/categorie/${inModifica.id}`
        : "/api/amministratore/categorie";
      const method = inModifica ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
        data?: { categoria?: CategoriaAdmin };
      } | null;

      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile salvare la categoria.");
      }

      const salvata = json?.data?.categoria;
      if (!salvata) throw new Error("Risposta non valida dal server.");

      const conConteggio: CategoriaAdmin = {
        ...salvata,
        negozi: inModifica ? inModifica.negozi : 0,
      };

      setLocali((prev) => {
        const altre = prev.filter((c) => c.id !== conConteggio.id);
        return [...altre, conConteggio].sort((a, b) => a.ordine - b.ordine);
      });
      chiudi();
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, [form, inModifica, chiudi, validaForm]);

  const cambiaStato = useCallback(async (categoria: CategoriaAdmin) => {
    if (categoria.negozi > 0 && categoria.attivo) {
      setErrore(
        "Questa categoria è usata da negozi attivi: non può essere disattivata senza rimuoverla prima dai negozi."
      );
      return;
    }
    setErrore(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/amministratore/categorie/${categoria.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: !categoria.attivo }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
        data?: { categoria?: CategoriaAdmin };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile aggiornare la categoria.");
      }
      const salvata = json?.data?.categoria;
      if (salvata) {
        setLocali((prev) =>
          prev.map((c) => (c.id === salvata.id ? { ...salvata, negozi: c.negozi } : c))
        );
      }
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, []);

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100";

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
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <FolderTree className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Struttura della piattaforma
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Categorie
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Gestisci le categorie utilizzate dai negozi e dalla piattaforma.
              Le modifiche ai sinonimi si riflettono subito su home, ricerca e
              pagina categoria (stesso matching esistente).
            </p>
          </div>
        </div>
      </div>

      {/* Barra di ricerca e azioni */}
      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={ricerca}
              onChange={(event) => setRicerca(event.target.value)}
              placeholder="Cerca categoria per nome, slug o sinonimo..."
              aria-label="Cerca categoria"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            type="button"
            onClick={apriCreazione}
            className="btn-cta px-5 text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuova categoria
          </button>
        </div>
      </div>

      {errore && (
        <div className="flex items-start gap-3 rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <span className="mt-0.5 block text-base font-black" aria-hidden>!</span>
          <p className="leading-6">{errore}</p>
          <button type="button" onClick={() => setErrore(null)} className="ml-auto rounded p-0.5 hover:bg-blue-100" aria-label="Chiudi errore">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Form creazione / modifica */}
      {(creazione || inModifica) && (
        <div className="rounded-[2rem] border border-blue-100 bg-blue-50/40 p-6 shadow-sm">
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            {inModifica ? "Modifica categoria" : "Nuova categoria"}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="categoria-nome" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Nome
              </label>
              <input
                id="categoria-nome"
                value={form.nome}
                onChange={(event) => setForm((f) => ({ ...f, nome: event.target.value }))}
                placeholder="Es. Panificio"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="categoria-slug" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Slug
              </label>
              <input
                id="categoria-slug"
                value={form.slug}
                onChange={(event) => setForm((f) => ({ ...f, slug: event.target.value }))}
                placeholder="Es. panificio"
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="categoria-sinonimi" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Sinonimi (separati da virgola)
            </label>
            <input
              id="categoria-sinonimi"
              value={form.sinonimi}
              onChange={(event) => setForm((f) => ({ ...f, sinonimi: event.target.value }))}
              placeholder="Es. forno, pane, pasticceria"
              className={inputClass}
            />
            <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
              I sinonimi garantiscono il matching con i negozi esistenti: i
              negozi la cui categoria corrisponde a nome o sinonimo continuano a
              comparire nella categoria.
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={salva}
              disabled={salvando}
              className="btn-cta flex-1 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {inModifica ? "Salva modifiche" : "Crea categoria"}
            </button>
            <button
              type="button"
              onClick={chiudi}
              disabled={salvando}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-100 px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm font-black text-slate-700">
          {visibili.length} {visibili.length === 1 ? "categoria" : "categorie"}
          <span className="ml-2 font-semibold text-blue-700">· {usate} con negozi</span>
        </p>
        {ricerca && (
          <button
            type="button"
            onClick={() => setRicerca("")}
            className="text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {visibili.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <FolderTree className="h-10 w-10 text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">Nessuna categoria trovata</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            Prova a modificare la ricerca oppure crea una nuova categoria.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {visibili.map((categoria) => {
            const conNegozi = (categoria.negozi ?? 0) > 0;
            return (
              <article
                key={categoria.id}
                className={`flex min-w-0 flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                  categoria.attivo ? "border-white/70" : "border-slate-100 opacity-80"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <Tags className="h-6 w-6" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black tracking-tight text-slate-900">
                        {categoria.nome}
                      </h2>
                      {categoria.attivo
                        ? conNegozi ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
                            In uso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 text-[11px] font-bold text-yellow-700 ring-1 ring-yellow-200">
                            Senza negozi
                          </span>
                        )
                        : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                            Disattivata
                          </span>
                        )}
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      /{categoria.slug}
                    </p>

                    <p className="mt-2 text-xs font-bold text-slate-700">
                      {categoria.negozi ?? 0} {categoria.negozi === 1 ? "negozio" : "negozi"}
                    </p>
                  </div>
                </div>

                {(categoria.sinonimi ?? []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                    {(categoria.sinonimi ?? []).slice(0, 5).map((sinonimo) => (
                      <span
                        key={sinonimo}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200"
                      >
                        <Sparkles className="h-2.5 w-2.5" aria-hidden />
                        {sinonimo}
                      </span>
                    ))}
                    {(categoria.sinonimi ?? []).length > 5 && (
                      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200">
                        +{(categoria.sinonimi ?? []).length - 5}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => apriModifica(categoria)}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-sm font-black text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    Modifica
                  </button>
                  {categoria.attivo ? (
                    <button
                      type="button"
                      onClick={() => cambiaStato(categoria)}
                      disabled={salvando}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Disattiva
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => cambiaStato(categoria)}
                      disabled={salvando}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-sm font-black text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Riattiva
                    </button>
                  )}
                  {conNegozi && (
                    <a
                      href={`/categorie/${categoria.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                    >
                      Negozi
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <p className="leading-6">
          <span className="font-bold">Nota:</span> la lista riflette le categorie
          configurate nella tabella <code className="font-mono text-xs">categorie</code>.
          Disattivare una categoria in uso non è permesso. Lo slug è univoco e
          le modifiche si applicano subito alla home.
        </p>
      </div>
    </div>
  );
}