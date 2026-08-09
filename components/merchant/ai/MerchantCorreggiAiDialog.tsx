"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  Undo2,
  X,
} from "lucide-react";
import type { ProductVisionSuggestion } from "@/lib/product-assistant/vision";
import type { CorrezioneCampo } from "@/lib/product-assistant/correggi-ai";

type MessaggioChat = {
  ruolo: "utente" | "ai";
  testo: string;
};

type ApiCorrezioneRisposta = {
  success: boolean;
  data?: {
    suggestion: ProductVisionSuggestion;
    cambi: CorrezioneCampo[];
    messaggio: string;
  };
  error?: { message?: string };
};

type MerchantCorreggiAiDialogProps = {
  negozioId: string;
  suggestion: ProductVisionSuggestion;
  photoUrl?: string;
  onClose: () => void;
  onConfirm: (suggestion: ProductVisionSuggestion) => void;
};

// ─── Riconoscimento vocale (Web Speech API, solo client) ─────────────────────
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

/**
 * Ritorna il costruttore della Web Speech API disponibile in QUESTO browser,
 * controllando ogni implementazione nota in modo INDIPENDENTE (standard, webkit,
 * moz, ms). Un valore non-funzione su una proprietà non deve nascondere
 * un'API valida esposta con un altro prefisso.
 */
function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  for (const chiave of [
    "SpeechRecognition",
    "webkitSpeechRecognition",
    "mozSpeechRecognition",
    "msSpeechRecognition",
  ] as const) {
    const c = w[chiave];
    if (typeof c === "function") return c as SpeechRecognitionCtor;
  }
  return null;
}

type Piattaforma = "ios" | "android" | "desktop" | "altro";

function getPiattaforma(): Piattaforma {
  if (typeof navigator === "undefined") return "altro";
  const ua = navigator.userAgent;
  // iPadOS 13+ riporta "Macintosh" come UA: rileva il touch come indizio.
  if (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua))
  ) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function messaggioNonDisponibile(piattaforma: Piattaforma): string {
  if (piattaforma === "ios") {
    return "Su iPhone/iPad il riconoscimento vocale del browser non è disponibile (Apple non supporta la Web Speech API in nessun browser iOS). Puoi scrivere la correzione nel campo di testo.";
  }
  if (piattaforma === "android") {
    return "Questo browser Android non espone il riconoscimento vocale: prova con Chrome o Samsung Internet, oppure scrivi la correzione nel campo di testo.";
  }
  return "Riconoscimento vocale non disponibile su questo browser: usa il campo di testo.";
}

const SUGGERIMENTI = [
  "Il colore non è bianco, è grigio",
  "La marca è Adidas, non Nike",
  "La taglia è 42",
  "Aggiungi che è usato",
  "Rendi la descrizione più commerciale",
];

export default function MerchantCorreggiAiDialog({
  negozioId,
  suggestion,
  photoUrl,
  onClose,
  onConfirm,
}: MerchantCorreggiAiDialogProps) {
  const [draft, setDraft] = useState<ProductVisionSuggestion>(suggestion);
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);
  const [ultimiCambi, setUltimiCambi] = useState<CorrezioneCampo[] | null>(null);
  const [storico, setStorico] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [history, setHistory] = useState<ProductVisionSuggestion[]>([]);
  const [input, setInput] = useState("");
  const [inCaricamento, setInCaricamento] = useState(false);
  const [erroreInvio, setErroreInvio] = useState<string | null>(null);

  // ── Stato microfono ────────────────────────────────────────────────────────
  const [listening, setListening] = useState(false);
  const [supportoVocale, setSupportoVocale] = useState<boolean | null>(null);
  const [permessoMicrofono, setPermessoMicrofono] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  const [erroreVocale, setErroreVocale] = useState<string | null>(null);
  const riconoscimentoRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef("");
  const baseTestoRef = useRef("");
  const haRisultatoRef = useRef(false);
  const stopManualeRef = useRef(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const permessoRef = useRef<PermissionStatus | null>(null);

  // ── Inizializzazione: disponibilità speech + stato permesso ────────────────
  useEffect(() => {
    const Ctor = getSpeechRecognition();
    setSupportoVocale(Ctor !== null);
    if (!Ctor) return;

    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((stato) => {
          permessoRef.current = stato;
          setPermessoMicrofono(stato.state as "granted" | "denied" | "prompt");
          stato.onchange = () => {
            setPermessoMicrofono(stato.state as "granted" | "denied" | "prompt");
          };
        })
        .catch(() => {
          setPermessoMicrofono("unknown");
        });
    }

    // Cleanup: interrompe l'ascolto senza messaggi spuri e rimuove il listener del permesso.
    return () => {
      stopManualeRef.current = true;
      riconoscimentoRef.current?.abort();
      riconoscimentoRef.current = null;
      if (permessoRef.current) permessoRef.current.onchange = null;
    };
  }, []);

  // Mantiene inputRef allineato al valore corrente del campo di testo.
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // ── Escape per chiudere ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Auto-scroll chat ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messaggi, ultimiCambi, inCaricamento]);

  // ── Microfono ──────────────────────────────────────────────────────────────
  /** Chiede il permesso microfono (se serve) e restituisce true se si può ascoltare. */
  const richiediPermessoMicrofono = useCallback(async (): Promise<boolean> => {
    if (permessoMicrofono === "denied") return false;
    if (permessoMicrofono === "granted") return true;
    // Permesso non ancora deciso: lo chiediamo esplicitamente (gesto utente)
    // così il rifiuto viene gestito in modo pulito e prevedibile.
    // Appena ottenuto, fermiamo subito le tracce: il permesso resta concesso
    // e il riconoscimento gestisce da sé il microfono (pattern Chrome).
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermessoMicrofono("granted");
      return true;
    } catch {
      setPermessoMicrofono("denied");
      setErroreVocale("Microfono non consentito: abilitalo dalle impostazioni del browser oppure scrivi la correzione.");
      return false;
    }
  }, [permessoMicrofono]);

  const startListening = useCallback(async () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setErroreVocale(messaggioNonDisponibile(getPiattaforma()));
      return;
    }

    // Su desktop (Chrome/Edge) il riconoscimento richiede il permesso microfono:
    // su Android il consenso lo gestisce il browser stesso all'avvio.
    if (getPiattaforma() === "desktop") {
      const ok = await richiediPermessoMicrofono();
      if (!ok) return;
    }

    if (!riconoscimentoRef.current) {
      const recognition = new Ctor();
      recognition.lang = "it-IT";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let trascrizione = "";
        for (let i = 0; i < event.results.length; i++) {
          trascrizione += event.results[i]?.[0]?.transcript ?? "";
        }
        const testo = trascrizione.trim();
        if (testo) {
          haRisultatoRef.current = true;
          const base = baseTestoRef.current;
          // Il testo riconosciuto finisce nel campo (modificabile prima dell'invio).
          setInput(base ? `${base} ${testo}` : testo);
        }
      };

      recognition.onerror = (event) => {
        const codice = event.error ?? "";
        if (codice === "not-allowed" || codice === "service-not-allowed") {
          setPermessoMicrofono("denied");
          setErroreVocale("Microfono non consentito: abilitalo dal browser oppure scrivi la correzione.");
        } else if (codice === "no-speech") {
          setErroreVocale("Non ho sentito nulla. Riprova o scrivi il testo.");
        } else if (codice === "audio-capture") {
          setErroreVocale("Nessun microfono rilevato: collega un microfono oppure scrivi il testo.");
        } else if (codice === "network") {
          setErroreVocale("Errore di rete nel riconoscimento vocale: usa il campo di testo.");
        } else if (codice === "language-not-supported") {
          setErroreVocale("Lingua non supportata dal riconoscimento vocale: scrivi il testo.");
        } else if (codice === "aborted") {
          // Interruzione manuale o chiusura del dialog: nessun messaggio.
        } else {
          setErroreVocale("Il riconoscimento vocale non ha funzionato: riprova o scrivi il testo.");
        }
      };

      recognition.onend = () => {
        // Un'istanza SpeechRecognition può essere usata una sola volta:
        // alla fine, rilascia il riferimento SOLO se è ancora la nostra istanza.
        const èAncoraAttiva = riconoscimentoRef.current === recognition;
        if (èAncoraAttiva) riconoscimentoRef.current = null;
        // Se nel frattempo è partita una nuova sessione (o il dialog è chiuso),
        // questo onend appartiene a una sessione superata: non tocca stato né messaggi.
        if (!èAncoraAttiva) return;
        setListening(false);
        // Ascolto terminato senza risultato e senza errore: avvisa l'utente.
        if (!stopManualeRef.current && !haRisultatoRef.current) {
          setErroreVocale("Non ho sentito nulla. Riprova o scrivi il testo.");
        }
        stopManualeRef.current = false;
        haRisultatoRef.current = false;
      };

      riconoscimentoRef.current = recognition;
    }

    setErroreVocale(null);
    haRisultatoRef.current = false;
    stopManualeRef.current = false;
    baseTestoRef.current = inputRef.current.trim();
    try {
      riconoscimentoRef.current.start();
      setListening(true);
    } catch {
      riconoscimentoRef.current = null;
      setListening(false);
      setErroreVocale("Microfono già in uso da un'altra applicazione.");
    }
  }, [richiediPermessoMicrofono]);

  const stopListening = useCallback(() => {
    stopManualeRef.current = true;
    riconoscimentoRef.current?.stop();
    // Rilascia subito il riferimento per permettere una nuova sessione di ascolto;
    // l'onend della vecchia istanza non sovrascriverà la nuova (guard in onend).
    riconoscimentoRef.current = null;
    setListening(false);
  }, []);

  // ── Invio correzione → endpoint correggi-ai (nessun write DB) ─────────────
  const inviaCorrezione = useCallback(
    async (testo: string) => {
      const messaggio = testo.trim();
      if (!messaggio || inCaricamento) return;

      setInput("");
      setErroreInvio(null);
      setMessaggi((prev) => [...prev, { ruolo: "utente", testo: messaggio }]);
      setUltimiCambi(null);
      setInCaricamento(true);

      try {
        const res = await fetch(`/api/merchant/stores/${negozioId}/products/correggi-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggestion: draft, messaggio, storico }),
        });

        const data = (await res.json()) as ApiCorrezioneRisposta;
        if (!res.ok || !data.success || !data.data) {
          throw new Error(data.error?.message ?? "Errore durante la correzione.");
        }

        const risposta = data.data;
        setDraft(risposta.suggestion);
        setUltimiCambi(risposta.cambi);
        setMessaggi((prev) => [...prev, { ruolo: "ai", testo: risposta.messaggio }]);
        setStorico((prev) => [
          ...prev,
          { role: "user", content: messaggio },
          { role: "assistant", content: risposta.messaggio },
        ]);
        setHistory((prev) => [...prev, draft]);
      } catch (caught) {
        setErroreInvio(caught instanceof Error ? caught.message : "Errore imprevisto.");
        setMessaggi((prev) => prev.slice(0, -1)); // rimuovi il messaggio utente non andato a buon fine
      } finally {
        setInCaricamento(false);
      }
    },
    [draft, storico, inCaricamento, negozioId]
  );

  // ── Annulla ultima modifica ────────────────────────────────────────────────
  const annullaUltimaModifica = useCallback(() => {
    if (history.length === 0) return;
    const precedente = history[history.length - 1];
    setDraft(precedente);
    setHistory(history.slice(0, -1));
    setMessaggi(messaggi.slice(0, -2)); // rimuovi ultima coppia utente + AI
    setStorico(storico.slice(0, -2));
    setUltimiCambi(null);
    setErroreInvio(null);
  }, [history, messaggi, storico]);

  // ── Conferma ───────────────────────────────────────────────────────────────
  const conferma = useCallback(() => {
    onConfirm(draft);
  }, [draft, onConfirm]);

  const supportoDeterminato = supportoVocale !== null;
  const microfonoDisponibile = supportoVocale === true;
  const suggerimento = SUGGERIMENTI[messaggi.length % SUGGERIMENTI.length];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Pannello */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Correggi con AI"
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 bg-gradient-to-b from-violet-600 to-fuchsia-600 px-5 py-4 text-white">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black tracking-tight">Correggi con AI</p>
            <p className="truncate text-[11px] font-medium text-violet-100">
              Parla o scrivi le correzioni al prodotto riconosciuto
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Riepilogo draft */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-[10px] font-bold text-slate-500">
              Foto
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{draft.nome || "Prodotto"}</p>
            <p className="truncate text-[11px] text-slate-500">
              {[draft.marca, draft.colore, draft.statoCondizione].filter(Boolean).join(" · ") ||
                "Nessun dettaglio"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">
            Draft
          </span>
        </div>

        {/* Area chat */}
        <div ref={chatRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* Messaggio di benvenuto */}
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-600">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] leading-5 text-slate-700 shadow-sm">
              Ciao! Ho riconosciuto il prodotto dai dati della scansione. Dimmi cosa correggere,
              ad esempio: <span className="font-semibold text-violet-700">«Il colore non è bianco, è grigio»</span>.
            </div>
          </div>

          {messaggi.map((m, i) =>
            m.ruolo === "utente" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-b from-blue-500 to-blue-700 px-3.5 py-2.5 text-[13px] leading-5 text-white shadow shadow-blue-500/20">
                  {m.testo}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-600">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] leading-5 text-slate-700 shadow-sm">
                  <p className="whitespace-pre-line">{m.testo}</p>

                  {/* Modifiche prima → dopo della risposta */}
                  {i === messaggi.length - 1 && ultimiCambi && ultimiCambi.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
                      {ultimiCambi.map((c) => (
                        <div
                          key={c.chiave}
                          className="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[12px]"
                        >
                          <span className="font-semibold text-emerald-900">{c.campo}:</span>{" "}
                          <span className="text-slate-500 line-through">{c.prima}</span>{" "}
                          <ArrowRight className="inline h-3 w-3 text-emerald-600" />{" "}
                          <span className="font-semibold text-emerald-700">{c.dopo}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {i === messaggi.length - 1 && ultimiCambi && ultimiCambi.length === 0 && (
                    <p className="mt-2 border-t border-slate-100 pt-2 text-[12px] font-medium text-slate-500">
                      Nessun campo modificato.
                    </p>
                  )}
                </div>
              </div>
            )
          )}

          {/* Indicatore di digitazione */}
          {inCaricamento && (
            <div className="flex items-start gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-600">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:240ms]" />
              </div>
            </div>
          )}

          {erroreInvio && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{erroreInvio}</span>
            </div>
          )}
        </div>

        {/* Banner microfono */}
        {supportoDeterminato && !microfonoDisponibile && (
          <div className="mx-5 mb-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{messaggioNonDisponibile(getPiattaforma())}</span>
          </div>
        )}
        {listening && (
          <div className="mx-5 mb-1 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-700">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span>
              <strong>Sto ascoltando...</strong> Parla ora, poi premi il quadrato rosso per fermare.
            </span>
          </div>
        )}
        {supportoDeterminato && microfonoDisponibile && permessoMicrofono === "denied" && (
          <div className="mx-5 mb-1 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-800">
            <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Microfono bloccato: consenti l&apos;accesso dalle impostazioni del browser oppure
              scrivi la correzione.
            </span>
          </div>
        )}
        {supportoDeterminato && microfonoDisponibile && permessoMicrofono === "prompt" && (
          <div className="mx-5 mb-1 flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] leading-4 text-violet-800">
            <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Premi il microfono e consenti l&apos;accesso quando il browser lo richiede.</span>
          </div>
        )}
        {erroreVocale && (
          <div className="mx-5 mb-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{erroreVocale}</span>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-100 px-4 pb-1.5 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={listening ? stopListening : () => void startListening()}
              disabled={!microfonoDisponibile || inCaricamento}
              aria-label={listening ? "Ferma ascolto" : "Correggi a voce"}
              title={microfonoDisponibile ? (listening ? "Ferma ascolto" : "Parla") : "Microfono non disponibile"}
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                listening
                  ? "border-red-300 bg-red-500 text-white shadow-lg shadow-red-500/30"
                  : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              }`}
            >
              {listening && (
                <span className="absolute inset-0 animate-ping rounded-xl bg-red-400/50" />
              )}
              {listening ? (
                <Square className="relative h-4 w-4 fill-current" />
              ) : (
                <Mic className="relative h-4.5 w-4.5" />
              )}
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  inviaCorrezione(input);
                }
              }}
              placeholder="Scrivi la correzione..."
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />

            <button
              type="button"
              onClick={() => inviaCorrezione(input)}
              disabled={!input.trim() || inCaricamento}
              aria-label="Invia"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-violet-500 to-fuchsia-600 text-white shadow shadow-fuchsia-500/25 transition hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {inCaricamento ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : (
                <Send className="h-4.5 w-4.5" />
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 px-1 pb-2">
            <button
              type="button"
              onClick={() => setInput(suggerimento)}
              className="truncate rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[10.5px] text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
            >
              💡 {suggerimento}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={annullaUltimaModifica}
            disabled={history.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Annulla ultima modifica
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={conferma}
            disabled={inCaricamento}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-bold text-white shadow shadow-emerald-500/25 transition hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" />
            Conferma modifiche
          </button>
        </div>
      </div>
    </div>
  );
}
