"use client";

import { useState } from "react";
import {
  AtSign,
  Building2,
  Check,
  ChevronLeft,
  Globe,
  Loader2,
  MapPinned,
  Percent,
  Save,
  Settings,
} from "lucide-react";

export type ImpostazioneEditoriale = {
  chiave: string;
  valore: string;
  descrizione: string;
  etichetta: string;
};

type StatoSalvataggio = { testo: string; ok: boolean } | null;

const SEZIONI: { titolo: string; chiavi: string[] }[] = [
  { titolo: "Identità piattaforma", chiavi: ["site_name", "site_tagline"] },
  { titolo: "Informazioni territoriali", chiavi: ["city_name"] },
  { titolo: "Contatti pubblici", chiavi: ["public_email", "public_phone"] },
  { titolo: "Footer", chiavi: ["footer_text"] },
];

const ICONE_SEZIONE: Record<string, React.ReactNode> = {
  "Identità piattaforma": <Building2 className="h-5 w-5" aria-hidden />,
  "Informazioni territoriali": <MapPinned className="h-5 w-5" aria-hidden />,
  "Contatti pubblici": <AtSign className="h-5 w-5" aria-hidden />,
  "Footer": <Globe className="h-5 w-5" aria-hidden />,
};

function CampoImpostazione({
  chiave,
  etichetta,
  descrizione,
  valore,
  salvato,
  inSalvataggio,
  onModifica,
}: {
  chiave: string;
  etichetta: string;
  descrizione: string;
  valore: string;
  salvato: boolean;
  inSalvataggio: boolean;
  onModifica: (chiave: string, valore: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5 last:last-of-type:border-none last:pb-0">
      <label htmlFor={`impostazione-${chiave}`} className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-800">{etichetta}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-400">{descrizione}</span>
        <input
          id={`impostazione-${chiave}`}
          type="text"
          value={valore}
          onChange={(evento) => onModifica(chiave, evento.target.value)}
          className={`mt-3 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-medium text-slate-800 transition focus:outline-none focus:ring-2 ${
            salvato
              ? "border-blue-300 focus:border-blue-300 focus:ring-blue-100"
              : "border-slate-200 focus:border-blue-300 focus:ring-blue-100"
          }`}
        />
      </label>
      <span
        className={`mt-10 inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 ring-1 ${
          salvato
            ? "bg-blue-50 text-blue-600 ring-blue-200"
            : "bg-slate-50 text-slate-400 ring-slate-200"
        }`}
      >
        {inSalvataggio ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : salvato ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
      </span>
    </div>
  );
}

export default function ImpostazioniModule({
  iniziali,
  commissionePercentuale,
}: {
  iniziali: ImpostazioneEditoriale[];
  commissionePercentuale: number;
}) {
  const [valori, setValori] = useState<Record<string, string>>(() =>
    Object.fromEntries(iniziali.map((i) => [i.chiave, i.valore]))
  );
  const [commissione, setCommissione] = useState<string>(() =>
    Number.isFinite(commissionePercentuale) ? String(commissionePercentuale) : "10"
  );
  const [salvati, setSalvati] = useState<Record<string, boolean>>({});
  const [inSalvataggio, setInSalvataggio] = useState<Record<string, boolean>>({});
  const [risultato, setRisultato] = useState<StatoSalvataggio>(null);

  const onModifica = (chiave: string, valore: string) => {
    setValori((precedenti) => ({ ...precedenti, [chiave]: valore }));
  };

  const salva = async (chiaviSezione: string[]) => {
    setRisultato(null);

    const prossimiSalvataggi: Record<string, boolean> = {};
    chiaviSezione.forEach((chiave) => {
      prossimiSalvataggi[chiave] = true;
    });
    setInSalvataggio(prossimiSalvataggi);

    try {
      const payload: Record<string, string> = {};
      chiaviSezione.forEach((chiave) => {
        payload[chiave] = valori[chiave] ?? "";
      });

      const risposta = await fetch("/api/amministratore/impostazioni", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await risposta.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
      } | null;

      if (!risposta.ok) {
        throw new Error(json?.error?.message ?? "Impossibile salvare le impostazioni.");
      }

      const prossiSalvati: Record<string, boolean> = {};
      chiaviSezione.forEach((chiave) => {
        prossiSalvati[chiave] = true;
      });
      setSalvati(prossiSalvati);
      setRisultato({ testo: "Impostazioni salvate con successo.", ok: true });
    } catch (errore) {
      setRisultato({
        testo: errore instanceof Error ? errore.message : "Errore sconosciuto.",
        ok: false,
      });
    } finally {
      setInSalvataggio({});
    }
  };

  const salvaCommissione = async () => {
    setRisultato(null);
    setInSalvataggio({ commissione_percentuale: true });

    try {
      const risposta = await fetch("/api/amministratore/impostazioni", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissione_percentuale: commissione }),
      });
      const json = (await risposta.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
      } | null;

      if (!risposta.ok) {
        throw new Error(json?.error?.message ?? "Impossibile salvare la commissione.");
      }

      setSalvati({ commissione_percentuale: true });
      setRisultato({ testo: "Commissione piattaforma salvata con successo.", ok: true });
    } catch (errore) {
      setRisultato({
        testo: errore instanceof Error ? errore.message : "Errore sconosciuto.",
        ok: false,
      });
    } finally {
      setInSalvataggio({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Intestazione pagina */}
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
            <Settings className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Struttura della piattaforma
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Impostazioni piattaforma
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Configura le informazioni principali di InCittà. Le modifiche
              vengono applicate subito a header, footer e pagine pubbliche.
            </p>
          </div>
        </div>
      </div>

      {risultato && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-3xl border px-5 py-4 text-sm shadow-sm ${
            risultato.ok
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {risultato.ok ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white"
                aria-hidden
              >
                !
              </span>
            )}
            <p className="leading-6">{risultato.testo}</p>
          </div>
          <button
            type="button"
            onClick={() => setRisultato(null)}
            className="rounded-full p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-600"
            aria-label="Chiudi messaggio"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      )}

      {SEZIONI.map((sezione) => {
        const campi = iniziali.filter((i) => sezione.chiavi.includes(i.chiave));
        return (
          <section
            key={sezione.titolo}
            className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm"
          >
            <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                {ICONE_SEZIONE[sezione.titolo] ?? <Settings className="h-5 w-5" aria-hidden />}
              </span>
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                {sezione.titolo}
              </h2>
            </header>

            <div className="space-y-0 px-6 py-5">
              {campi.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nessuna impostazione disponibile per questa sezione.
                </p>
              ) : (
                campi.map((campo) => (
                  <CampoImpostazione
                    key={campo.chiave}
                    chiave={campo.chiave}
                    etichetta={campo.etichetta}
                    descrizione={campo.descrizione}
                    valore={valori[campo.chiave] ?? ""}
                    salvato={Boolean(salvati[campo.chiave])}
                    inSalvataggio={Boolean(inSalvataggio[campo.chiave])}
                    onModifica={onModifica}
                  />
                ))
              )}
            </div>

            {campi.length > 0 && (
              <footer className="flex justify-end border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => salva(sezione.chiavi)}
                  disabled={Object.values(inSalvataggio).some(Boolean)}
                  className="btn-cta px-6 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" aria-hidden />
                  Salva
                </button>
              </footer>
            )}
          </section>
        );
      })}

      {/* Commissione piattaforma — fonte autorevole piattaforma_config */}
      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm">
        <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Percent className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            Commissione piattaforma
          </h2>
        </header>

        <div className="space-y-0 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <label htmlFor="impostazione-commissione_percentuale" className="min-w-0 flex-1">
              <span className="block text-sm font-black text-slate-800">
                Percentuale commissione
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-400">
                Commissione trattenuta dalla piattaforma sugli ordini pagati.
                Valore consentito: 0%–10% (decimali inclusi, es. 7.5).
              </span>
              <div className="mt-3 flex items-center gap-2">
                <input
                  id="impostazione-commissione_percentuale"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  inputMode="decimal"
                  value={commissione}
                  onChange={(evento) => setCommissione(evento.target.value)}
                  className="w-40 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <span className="text-sm font-semibold text-slate-500">%</span>
              </div>
            </label>
            <span
              className={`mt-10 inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 ring-1 ${
                Boolean(salvati["commissione_percentuale"])
                  ? "bg-blue-50 text-blue-600 ring-blue-200"
                  : "bg-slate-50 text-slate-400 ring-slate-200"
              }`}
            >
              {Boolean(inSalvataggio["commissione_percentuale"]) ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : Boolean(salvati["commissione_percentuale"]) ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
            </span>
          </div>
        </div>

        <footer className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={salvaCommissione}
            disabled={Object.values(inSalvataggio).some(Boolean)}
            className="btn-cta px-6 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            Salva
          </button>
        </footer>
      </section>

      {/* Nota finale */}
      <p className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-6 text-slate-500">
        Le impostazioni salvate sono configurazione pubblica del sito. Chiavi
        API, password e dati sensibili non sono mai gestiti da questa pagina.
      </p>
    </div>
  );
}