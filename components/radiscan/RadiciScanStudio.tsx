"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AlertTriangle,
  Camera,
  ImagePlus,
  Loader2,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import type { EsitoAnalisi } from "@/lib/radiscan/tipi";
import ScanRisultato from "./ScanRisultato";
import {
  LATO_MASSIMO,
  LATO_MINIMO,
  MAX_IMMAGINE_BYTES,
  calcolaLato,
  descriviQuota,
  estraiErrore,
  estraiRisposta,
  messaggioErrore,
  validaFileLocale,
  type ErroreApi,
} from "./logica";

type Fase = "inizio" | "fotocamera" | "anteprima" | "analisi" | "esito" | "errore";
type SorgenteImmagine = ImageBitmap | HTMLImageElement;

const LATO_MASSIMO_SCATTO = 2000;

function messaggioFotocamera(causa: unknown): string {
  const nome =
    typeof causa === "object" && causa !== null && "name" in causa
      ? String((causa as { name?: unknown }).name ?? "")
      : "";

  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return "Permesso fotocamera negato. Abilitalo nelle impostazioni del browser oppure carica un'immagine.";
  }
  if (nome === "NotFoundError" || nome === "DevicesNotFoundError") {
    return "Nessuna fotocamera disponibile su questo dispositivo. Carica un'immagine dalla galleria o dal computer.";
  }
  if (nome === "NotReadableError" || nome === "TrackStartError") {
    return "La fotocamera è occupata da un altro programma. Chiudila e riprova, oppure carica un'immagine.";
  }
  return "Non riesco ad aprire la fotocamera. Carica un'immagine dalla galleria o dal computer.";
}

function dimensioniSorgente(sorgente: SorgenteImmagine): {
  larghezza: number;
  altezza: number;
} {
  if ("naturalWidth" in sorgente) {
    return { larghezza: sorgente.naturalWidth, altezza: sorgente.naturalHeight };
  }
  return { larghezza: sorgente.width, altezza: sorgente.height };
}

async function decodificaImmagine(file: File): Promise<SorgenteImmagine> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fallback per browser che non decodificano il formato con createImageBitmap.
    }
  }

  return await new Promise<SorgenteImmagine>((resolve, reject) => {
    const immagine = new Image();
    const url = URL.createObjectURL(file);
    immagine.onload = () => {
      URL.revokeObjectURL(url);
      resolve(immagine);
    };
    immagine.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Immagine non leggibile."));
    };
    immagine.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, qualità: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Non riesco a preparare l'immagine."));
      },
      "image/jpeg",
      qualità
    );
  });
}

/**
 * Normalizzazione conservativa: lato massimo 2400 px, qualità 0,92, nessun
 * filtro di contrasto o nitidezza. La qualità scende solo se il file supera
 * i 3 MiB; il ridimensionamento successivo resta sopra i 1200 px.
 */
async function normalizzaImmagine(file: File): Promise<File> {
  const sorgente = await decodificaImmagine(file);

  try {
    const originali = dimensioniSorgente(sorgente);
    if (originali.larghezza <= 0 || originali.altezza <= 0) {
      throw new Error("L'immagine non ha dimensioni valide.");
    }

    let latoMassimo = LATO_MASSIMO;
    let qualità = 0.92;

    for (let tentativo = 0; tentativo < 7; tentativo++) {
      const dimensioni = calcolaLato(
        originali.larghezza,
        originali.altezza,
        latoMassimo
      );

      const canvas = document.createElement("canvas");
      canvas.width = dimensioni.larghezza;
      canvas.height = dimensioni.altezza;

      const contesto = canvas.getContext("2d");
      if (!contesto) {
        throw new Error("Non riesco a preparare l'immagine.");
      }

      contesto.imageSmoothingEnabled = true;
      contesto.imageSmoothingQuality = "high";
      // Le foto PNG con trasparenza diventano JPEG: il fondo bianco evita
      // zone nere attorno all'etichetta.
      contesto.fillStyle = "#ffffff";
      contesto.fillRect(0, 0, canvas.width, canvas.height);
      contesto.drawImage(
        sorgente as CanvasImageSource,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await canvasToBlob(canvas, qualità);
      if (blob.size <= MAX_IMMAGINE_BYTES) {
        const nome = file.name.replace(/\.[^.]+$/, "") || "radiscan";
        return new File([blob], `${nome}.jpg`, { type: "image/jpeg" });
      }

      if (qualità > 0.74) {
        qualità = Math.max(0.74, qualità - 0.06);
      } else {
        latoMassimo = Math.max(LATO_MINIMO, Math.round(latoMassimo * 0.82));
      }
    }

    throw new Error(
      "Non riesco a ridurre l'immagine sotto 3 MB. Prova con una foto più leggera."
    );
  } finally {
    if (typeof ImageBitmap !== "undefined" && sorgente instanceof ImageBitmap) {
      sorgente.close();
    }
  }
}

export default function RadiciScanStudio() {
  const [fase, setFase] = useState<Fase>("inizio");
  const [file, setFile] = useState<File | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoAnalisi | null>(null);
  const [daCache, setDaCache] = useState(false);
  const [errore, setErrore] = useState<ErroreApi | null>(null);
  const [erroreStato, setErroreStato] = useState(0);
  const [erroreLocale, setErroreLocale] = useState<string | null>(null);
  const [trascinando, setTrascinando] = useState(false);
  const [avvioFotocamera, setAvvioFotocamera] = useState(false);
  const [erroreFotocamera, setErroreFotocamera] = useState<string | null>(null);
  const [scattoDaFotocamera, setScattoDaFotocamera] = useState(false);

  const inputGalleria = useRef<HTMLInputElement | null>(null);
  const inputFotocamera = useRef<HTMLInputElement | null>(null);
  const anteprimaRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idGalleria = useId();
  const idFotocamera = useId();

  function fermaFotocamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((traccia) => traccia.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    return () => {
      fermaFotocamera();
      if (anteprimaRef.current) {
        URL.revokeObjectURL(anteprimaRef.current);
        anteprimaRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (fase !== "fotocamera") return;

    let annullato = false;
    setAvvioFotocamera(true);
    setErroreFotocamera(null);

    async function avviaFotocamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia non disponibile");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (annullato) {
          stream.getTracks().forEach((traccia) => traccia.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
      } catch (causa) {
        if (!annullato) setErroreFotocamera(messaggioFotocamera(causa));
      } finally {
        if (!annullato) setAvvioFotocamera(false);
      }
    }

    void avviaFotocamera();

    return () => {
      annullato = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((traccia) => traccia.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [fase]);

  function apriFotocamera() {
    if (fase === "analisi") return;
    setErroreLocale(null);
    setErroreFotocamera(null);
    setFase("fotocamera");
  }

  function annullaFotocamera() {
    fermaFotocamera();
    setAvvioFotocamera(false);
    setErroreFotocamera(null);
    setFase("inizio");
  }

  function riapriFotocamera() {
    if (anteprimaRef.current) {
      URL.revokeObjectURL(anteprimaRef.current);
      anteprimaRef.current = null;
    }
    setAnteprima(null);
    setFile(null);
    setEsito(null);
    setDaCache(false);
    setErrore(null);
    setErroreStato(0);
    setErroreLocale(null);
    setErroreFotocamera(null);
    setScattoDaFotocamera(false);
    setFase("fotocamera");
  }

  function scattaFoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErroreFotocamera(
        "La fotocamera non è ancora pronta. Attendi un istante e riprova."
      );
      return;
    }

    const scala = Math.min(
      1,
      LATO_MASSIMO_SCATTO / Math.max(video.videoWidth, video.videoHeight)
    );
    const larghezza = Math.max(1, Math.round(video.videoWidth * scala));
    const altezza = Math.max(1, Math.round(video.videoHeight * scala));
    const canvas = document.createElement("canvas");
    canvas.width = larghezza;
    canvas.height = altezza;
    const contesto = canvas.getContext("2d");

    if (!contesto) {
      setErroreFotocamera("Non riesco a preparare lo scatto. Riprova.");
      return;
    }

    contesto.drawImage(video, 0, 0, larghezza, altezza);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErroreFotocamera("Non riesco a salvare lo scatto. Riprova.");
          return;
        }

        fermaFotocamera();
        const scatto = new File([blob], "radiscan-scatto.jpg", {
          type: "image/jpeg",
        });
        setScattoDaFotocamera(true);
        void gestisciFile(scatto, true);
      },
      "image/jpeg",
      0.92
    );
  }

  async function gestisciFile(
    scelto: File | null | undefined,
    daFotocamera = false
  ) {
    if (!scelto || fase === "analisi") return;

    setErroreLocale(null);
    setErrore(null);
    setErroreStato(0);

    const validazione = validaFileLocale(scelto);
    if (!validazione.ok) {
      setErroreLocale(validazione.messaggio);
      if (daFotocamera) setFase("inizio");
      return;
    }

    try {
      const normalizzato = await normalizzaImmagine(scelto);

      if (anteprimaRef.current) {
        URL.revokeObjectURL(anteprimaRef.current);
      }
      const url = URL.createObjectURL(normalizzato);
      anteprimaRef.current = url;

      setAnteprima(url);
      setFile(normalizzato);
      setEsito(null);
      setDaCache(false);
      setScattoDaFotocamera(daFotocamera);
      setFase("anteprima");
    } catch (causa) {
      if (daFotocamera) setFase("inizio");
      setErroreLocale(
        causa instanceof Error ? causa.message : "Immagine non leggibile."
      );
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const scelto = event.target.files?.[0] ?? null;
    event.target.value = "";
    void gestisciFile(scelto, false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setTrascinando(false);
    if (fase === "analisi") return;
    void gestisciFile(event.dataTransfer.files?.[0] ?? null);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (fase !== "analisi") setTrascinando(true);
  }

  async function analizza() {
    if (!file || fase === "analisi") return;

    setFase("analisi");
    setErrore(null);
    setErroreStato(0);
    setErroreLocale(null);

    const corpo = new FormData();
    corpo.append("immagine", file);

    try {
      // Il Content-Type non viene impostato a mano: il browser aggiunge il
      // boundary corretto per il multipart.
      const risposta = await fetch("/api/radiscan/analisi", {
        method: "POST",
        body: corpo,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      const dati: unknown = await risposta.json().catch(() => null);

      if (risposta.ok) {
        try {
          const risultato = estraiRisposta(dati);
          setEsito(risultato.esito);
          setDaCache(risultato.cache);
          setFase("esito");
        } catch {
          setErrore({
            codice: "RISPOSTA_NON_VALIDA",
            messaggio: "Il servizio ha restituito un esito non leggibile.",
          });
          setErroreStato(502);
          setFase("errore");
        }
        return;
      }

      const erroreApi = estraiErrore(dati) ?? {
        codice: "ERRORE_INTERNO",
        messaggio: "Errore non specificato.",
      };
      const retryAfter = Number(risposta.headers.get("retry-after") ?? "");
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        erroreApi.riprovaSecondi = retryAfter;
      }

      setErrore(erroreApi);
      setErroreStato(risposta.status);
      setFase("errore");
    } catch {
      setErrore({
        codice: "RETE",
        messaggio: "Connessione non disponibile.",
      });
      setErroreStato(0);
      setFase("errore");
    }
  }

  function reset() {
    if (fase === "analisi") return;

    fermaFotocamera();
    setAvvioFotocamera(false);
    setErroreFotocamera(null);
    setScattoDaFotocamera(false);

    if (anteprimaRef.current) {
      URL.revokeObjectURL(anteprimaRef.current);
      anteprimaRef.current = null;
    }

    setAnteprima(null);
    setFile(null);
    setEsito(null);
    setDaCache(false);
    setErrore(null);
    setErroreStato(0);
    setErroreLocale(null);
    setTrascinando(false);
    setFase("inizio");

    if (inputGalleria.current) inputGalleria.current.value = "";
    if (inputFotocamera.current) inputFotocamera.current.value = "";
  }

  const testoErrore = errore
    ? messaggioErrore({
        stato: erroreStato,
        codice: errore.codice,
        messaggio: errore.messaggio,
        riprovaSecondi: errore.riprovaSecondi,
      })
    : "";

  return (
    <section className="rd-fascia p-4 md:p-6" aria-busy={fase === "analisi"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="rd-occhiello">
            <ScanLine aria-hidden />
            Fotografia e verifica
          </p>
          <h2 className="rd-titolo-scheda mt-1 text-xl md:text-2xl">
            Analizza un prodotto
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#57534e]">
            Scatta o carica una foto dell&apos;etichetta: RadiciScan legge i dati
            visibili e li confronta con le fonti ufficiali.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5ded0] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b6459]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#24462f]" aria-hidden />
          Nessuna immagine conservata
        </span>
      </div>

      <ul className="mt-4 grid gap-2 border-t border-[#e5ded0] pt-3 sm:grid-cols-3 sm:gap-4">
        <li className="flex items-start gap-2">
          <Camera
            className="mt-0.5 h-4 w-4 shrink-0 text-[#24462f]"
            aria-hidden
          />
          <div>
            <p className="text-xs font-bold leading-4 text-[#1b3624]">
              Fotografa il prodotto
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#6b6459]">
              Inquadra l&apos;etichetta, senza riflessi.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-2">
          <ScanLine
            className="mt-0.5 h-4 w-4 shrink-0 text-[#24462f]"
            aria-hidden
          />
          <div>
            <p className="text-xs font-bold leading-4 text-[#1b3624]">
              Leggi l&apos;etichetta
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#6b6459]">
              Controlla nome, denominazione e territorio.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-2">
          <ImagePlus
            className="mt-0.5 h-4 w-4 shrink-0 text-[#24462f]"
            aria-hidden
          />
          <div>
            <p className="text-xs font-bold leading-4 text-[#1b3624]">
              Carica una fotografia
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#6b6459]">
              In alternativa, usa galleria o computer.
            </p>
          </div>
        </li>
      </ul>

      {erroreLocale ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{erroreLocale}</span>
        </div>
      ) : null}

      {fase === "fotocamera" ? (
        <div className="mt-5 rounded-2xl border border-[#e5ded0] bg-[#0d1a12] p-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[420px] w-full object-contain"
              aria-label="Anteprima della fotocamera"
            />
            {avvioFotocamera ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <p className="text-xs font-semibold">Apertura fotocamera…</p>
              </div>
            ) : null}
          </div>

          {erroreFotocamera ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-red-300/40 bg-red-950/40 p-3 text-sm leading-6 text-red-100"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{erroreFotocamera}</span>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label
                  htmlFor={idGalleria}
                  className="rd-azione cursor-pointer justify-center px-4 py-2.5"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  Carica un&apos;immagine
                </label>
                <label
                  htmlFor={idFotocamera}
                  className="rd-azione-tenue cursor-pointer justify-center px-4 py-2.5"
                >
                  <Camera className="h-4 w-4" aria-hidden />
                  Usa fotocamera del dispositivo
                </label>
                <button
                  type="button"
                  onClick={annullaFotocamera}
                  className="px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:text-white"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-3 text-center text-xs leading-5 text-white/70">
                Inquadra l&apos;etichetta e scatta. Su smartphone viene richiesta
                la fotocamera posteriore, quando disponibile.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={scattaFoto}
                  disabled={avvioFotocamera}
                  className="rd-azione flex-1 justify-center px-4 py-2.5 disabled:cursor-wait disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" aria-hidden />
                  Scatta foto
                </button>
                <label
                  htmlFor={idGalleria}
                  className="rd-azione-tenue cursor-pointer justify-center px-4 py-2.5"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  Carica dalla galleria
                </label>
                <button
                  type="button"
                  onClick={annullaFotocamera}
                  className="px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:text-white"
                >
                  Annulla
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <input
        ref={inputGalleria}
        id={idGalleria}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onFileInput}
      />
      <input
        ref={inputFotocamera}
        id={idFotocamera}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={onFileInput}
      />

      {fase === "inizio" ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setTrascinando(false)}
          className={`mt-4 rounded-2xl border-2 border-dashed p-4 text-center transition md:p-5 ${
            trascinando
              ? "border-[#d5a83a] bg-[#fbf6e8]"
              : "border-[#e5ded0] bg-[#fffdf7]"
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#24462f] text-white shadow-[0_12px_24px_-16px_rgba(27,54,36,0.9)]">
            <ImagePlus className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-bold text-[#1b3624]">
            Trascina qui una foto, oppure
          </p>

          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <label
              htmlFor={idGalleria}
              className="rd-azione cursor-pointer px-5 py-2.5"
            >
              <ImagePlus className="h-4 w-4" aria-hidden />
              Carica immagine
            </label>
            <button
              type="button"
              onClick={apriFotocamera}
              className="rd-azione-tenue px-5 py-2.5"
            >
              <Camera className="h-4 w-4" aria-hidden />
              Scatta foto
            </button>
          </div>

          <p className="mt-2 text-[11px] leading-4 text-[#8a8378]">
            Su PC si apre la webcam; su smartphone la fotocamera posteriore,
            quando disponibile.
            <span className="mt-0.5 block">
              JPEG, PNG o WebP · massimo 3 MB · la foto non viene conservata.
            </span>
          </p>
        </div>
      ) : null}

      {(fase === "anteprima" || fase === "analisi") && anteprima ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="overflow-hidden rounded-2xl border border-[#e5ded0] bg-[#0d1a12]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={anteprima}
              alt="Anteprima del prodotto selezionato"
              className="max-h-[420px] w-full object-contain"
            />
          </div>

          <div className="flex flex-col justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#1b3624]">Foto pronta</p>
              <p className="mt-1 text-sm leading-6 text-[#57534e]">
                Controlla che l&apos;etichetta sia leggibile e che il prodotto sia
                centrato nell&apos;immagine.
              </p>
              <p className="mt-2 text-xs leading-5 text-[#8a8378]">
                L&apos;immagine viene ridimensionata nel browser e inviata solo per
                questa analisi.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void analizza()}
                disabled={fase === "analisi"}
                className="rd-azione w-full px-5 py-2.5 disabled:cursor-wait disabled:opacity-60"
              >
                {fase === "analisi" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ScanLine className="h-4 w-4" aria-hidden />
                )}
                {fase === "analisi"
                  ? "Analisi in corso…"
                  : "Analizza con RadiciScan"}
              </button>
              {scattoDaFotocamera ? (
                <button
                  type="button"
                  onClick={riapriFotocamera}
                  disabled={fase === "analisi"}
                  className="rd-azione-tenue w-full px-5 py-2.5 disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" aria-hidden />
                  Ripeti foto
                </button>
              ) : null}
              <button
                type="button"
                onClick={reset}
                disabled={fase === "analisi"}
                className="rd-azione-tenue w-full px-5 py-2.5 disabled:opacity-60"
              >
                Scegli un&apos;altra foto
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fase === "analisi" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-center gap-3 rounded-xl border border-[#e8dfc9] bg-[#fbf6e8] p-4"
        >
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#24462f]" aria-hidden />
          <div>
            <p className="text-sm font-bold text-[#1b3624]">Analisi in corso</p>
            <p className="text-xs leading-5 text-[#57534e]">
              Sto leggendo l&apos;etichetta e confrontando la denominazione con le
              fonti ufficiali.
            </p>
          </div>
        </div>
      ) : null}

      {fase === "errore" && errore ? (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden />
            <div>
              <p className="text-sm font-black text-red-900">
                Analisi non completata
              </p>
              <p className="mt-1 text-sm leading-6 text-red-800">{testoErrore}</p>
              {errore.quota ? (
                <p className="mt-2 text-xs leading-5 text-red-700">
                  {descriviQuota(errore.quota)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {file ? (
              <button
                type="button"
                onClick={() => void analizza()}
                className="rd-azione px-5 py-2.5"
              >
                Riprova
              </button>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="rd-azione-tenue px-5 py-2.5"
            >
              Scegli un&apos;altra foto
            </button>
          </div>
        </div>
      ) : null}

      {fase === "esito" && esito ? (
        <ScanRisultato esito={esito} cache={daCache} onReset={reset} />
      ) : null}

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#e8dfc9] bg-[#fbf6e8] p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#24462f]" aria-hidden />
        <p className="text-xs leading-5 text-[#57534e]">
          RadiciScan verifica la documentazione della denominazione, non
          certifica il singolo esemplare. L&apos;immagine non viene conservata:
          viene inviata solo per l&apos;analisi in corso.
        </p>
      </div>
    </section>
  );
}
