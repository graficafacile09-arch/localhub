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

// ─── Registrazione vocale (MediaRecorder → Groq Whisper, solo client) ────────
const MIME_OPZIONI = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Sceglie il primo MIME audio supportato dal browser (Chrome/Android/FF → webm, Safari/iOS → mp4). */
function scegliMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mime of MIME_OPZIONI) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // MIME non riconosciuto: prova il successivo
    }
  }
  return undefined;
}

function estensionePerMime(mime: string | undefined): string {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
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
  const [trascrivendo, setTrascrivendo] = useState(false);
  const [permessoInAttesa, setPermessoInAttesa] = useState(false);
  const [supportoRegistrazione, setSupportoRegistrazione] = useState<boolean | null>(null);
  const [permessoMicrofono, setPermessoMicrofono] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  const [erroreVocale, setErroreVocale] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkAudioRef = useRef<Blob[]>([]);
  const startingRef = useRef(false); // guard sincrono contro il doppio tap
  const chiusoRef = useRef(false); // true quando il dialog è stato chiuso
  const baseTestoRef = useRef("");
  const inputRef = useRef("");

  const chatRef = useRef<HTMLDivElement>(null);
  const inputElRef = useRef<HTMLInputElement>(null);
  const permessoRef = useRef<PermissionStatus | null>(null);

  // ── Inizializzazione: supporto MediaRecorder + stato permesso ──────────────
  useEffect(() => {
    setSupportoRegistrazione(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia
    );

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

    // Cleanup: ferma registrazione e stream, rimuove il listener del permesso.
    // Il ref viene azzerato PRIMA di fermare lo stream: l'onstop che scatta
    // quando il dialog è chiuso non invierà alcun upload (guard in onstop).
    return () => {
      chiusoRef.current = true;
      mediaRecorderRef.current = null;
      fermaStream();
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
  function fermaStream() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  /** Invia il clip audio al backend (Groq Whisper) e inserisce il testo nel campo. */
  const inviaTrascrizione = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (blob.size === 0) {
        setErroreVocale("Non ho registrato nulla. Riprova o scrivi il testo.");
        return;
      }
      setTrascrivendo(true);
      setErroreVocale(null);
      try {
        const formData = new FormData();
        formData.append("audio", blob, `registrazione.${estensionePerMime(mimeType)}`);

        const res = await fetch(`/api/merchant/stores/${negozioId}/products/trascrivi-audio`, {
          method: "POST",
          body: formData,
        });

        const data = (await res.json()) as {
          success?: boolean;
          data?: { testo?: string };
          error?: { message?: string };
        };
        if (!res.ok || !data.success || !data.data?.testo) {
          throw new Error(data.error?.message ?? "Errore durante la trascrizione.");
        }

        const testo = data.data.testo.trim();
        if (!testo) {
          setErroreVocale("Non ho sentito nulla. Riprova o scrivi il testo.");
          return;
        }

        const base = baseTestoRef.current;
        // Il testo trascritto finisce nel campo (modificabile prima dell'invio)
        // e il focus va subito sul campo per poter modificare o premere Invio.
        setInput(base ? `${base} ${testo}` : testo);
        inputElRef.current?.focus();
      } catch (caught) {
        setErroreVocale(
          caught instanceof Error ? caught.message : "Errore durante la trascrizione."
        );
      } finally {
        setTrascrivendo(false);
      }
    },
    [negozioId]
  );

  const startListening = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErroreVocale("La registrazione vocale non è disponibile su questo browser: usa il campo di testo.");
      return;
    }
    // Guard sincrono: impedisce che un doppio tap avvii due stream/recorder
    // (il setState di `listening` arriva solo DOPO l'await di getUserMedia).
    if (listening || trascrivendo || startingRef.current) return;
    startingRef.current = true;
    setPermessoInAttesa(true);

    // Chiede il permesso al microfono UNA SOLA VOLTA (il browser se lo ricorda)
    // e, appena autorizzato, la registrazione parte AUTOMATICAMENTE.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermessoMicrofono("granted");
    } catch {
      startingRef.current = false;
      setPermessoInAttesa(false);
      setPermessoMicrofono("denied");
      setErroreVocale("Microfono non consentito: abilitalo dalle impostazioni del browser oppure scrivi la correzione.");
      return;
    }
    setPermessoInAttesa(false);
    // Se il dialog è stato chiuso mentre il prompt permesso era aperto,
    // libera subito lo stream appena ottenuto (niente microfono in background).
    if (chiusoRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      startingRef.current = false;
      return;
    }
    mediaStreamRef.current = stream;

    const mimeType = scegliMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    mediaRecorderRef.current = recorder;
    chunkAudioRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunkAudioRef.current.push(e.data);
    };

    recorder.onerror = () => {
      startingRef.current = false;
      setPermessoInAttesa(false);
      fermaStream();
      mediaRecorderRef.current = null;
      setListening(false);
      setErroreVocale("Errore durante la registrazione: riprova o scrivi il testo.");
    };

    recorder.onstop = async () => {
      // Se il dialog è stato chiuso (ref azzerato dal cleanup) non inviamo nulla.
      const èRegistrazioneAttiva = mediaRecorderRef.current === recorder;
      const blob = new Blob(chunkAudioRef.current, {
        type: recorder.mimeType || mimeType || "audio/webm",
      });
      chunkAudioRef.current = [];
      fermaStream();
      startingRef.current = false;
      setPermessoInAttesa(false);
      if (èRegistrazioneAttiva) mediaRecorderRef.current = null;
      setListening(false);
      if (!èRegistrazioneAttiva) return;
      // Parte automaticamente la trascrizione Whisper.
      await inviaTrascrizione(blob, recorder.mimeType || mimeType || "audio/webm");
    };

    baseTestoRef.current = inputRef.current.trim();
    setErroreVocale(null);
    try {
      recorder.start();
      setListening(true);
    } catch {
      startingRef.current = false;
      setPermessoInAttesa(false);
      fermaStream();
      mediaRecorderRef.current = null;
      setListening(false);
      setErroreVocale("Impossibile avviare la registrazione: riprova o scrivi il testo.");
    }
  }, [listening, trascrivendo, inviaTrascrizione]);

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // fallback: ferma lo stream direttamente
        startingRef.current = false;
        fermaStream();
        mediaRecorderRef.current = null;
        setListening(false);
      }
    } else {
      startingRef.current = false;
      fermaStream();
      mediaRecorderRef.current = null;
      setListening(false);
    }
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

  const supportoDeterminato = supportoRegistrazione !== null;
  const microfonoDisponibile = supportoRegistrazione === true;
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

        {/* Banner microfono (solo casi eccezionali: il resto è sul pulsante) */}
        {supportoDeterminato && !microfonoDisponibile && (
          <div className="mx-5 mb-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              La registrazione vocale non è disponibile su questo browser: puoi scrivere le
              correzioni nel campo di testo.
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
        {erroreVocale && (
          <div className="mx-5 mb-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{erroreVocale}</span>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-100 px-4 pb-1.5 pt-3">
          {/* Pulsante microfono: stato sempre visibile e tappabile */}
          <button
            type="button"
            onClick={listening ? stopListening : () => void startListening()}
            disabled={!microfonoDisponibile || inCaricamento || trascrivendo || permessoInAttesa}
            aria-label={
              listening
                ? "Ferma registrazione"
                : trascrivendo
                  ? "Trascrizione in corso"
                  : "Parla"
            }
            title={
              microfonoDisponibile
                ? listening
                  ? "Ferma registrazione"
                  : "Parla"
                : "Microfono non disponibile"
            }
            className={`relative flex h-13 w-full items-center justify-center gap-2 rounded-2xl border text-sm font-bold tracking-tight transition active:scale-[0.98] disabled:cursor-not-allowed ${
              listening
                ? "border-red-300 bg-red-500 text-white shadow-lg shadow-red-500/30"
                : trascrivendo || permessoInAttesa
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            } ${
              // Opacità ridotta solo quando il pulsante è inutilizzabile,
              // NON durante la richiesta permesso (deve restare ben visibile).
              permessoInAttesa ? "" : "disabled:opacity-50"
            }`}
          >
            {listening && (
              <span className="absolute inset-0 animate-ping rounded-2xl bg-red-400/40" />
            )}
            {permessoInAttesa ? (
              <>
                <Loader2 className="relative h-4.5 w-4.5 animate-spin" />
                Consenti microfono…
              </>
            ) : listening ? (
              <>
                <Square className="relative h-4 w-4 fill-current" />
                Sto ascoltando…
              </>
            ) : trascrivendo ? (
              <>
                <Loader2 className="relative h-4.5 w-4.5 animate-spin" />
                Trascrizione…
              </>
            ) : (
              <>
                <Mic className="relative h-4.5 w-4.5" />
                Parla
              </>
            )}
          </button>

          <div className="mt-2 flex items-center gap-2">
            <input
              ref={inputElRef}
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
