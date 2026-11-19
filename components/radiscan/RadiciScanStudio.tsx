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

type Fase = "inizio" | "anteprima" | "analisi" | "esito" | "errore";
type SorgenteImmagine = ImageBitmap | HTMLImageElement;

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

  const inputGalleria = useRef<HTMLInputElement | null>(null);
  const inputFotocamera = useRef<HTMLInputElement | null>(null);
  const anteprimaRef = useRef<string | null>(null);
  const idGalleria = useId();
  const idFotocamera = useId();

  useEffect(() => {
    return () => {
      if (anteprimaRef.current) {
        URL.revokeObjectURL(anteprimaRef.current);
        anteprimaRef.current = null;
      }
    };
  }, []);

  async function gestisciFile(scelto: File | null | undefined) {
    if (!scelto || fase === "analisi") return;

    setErroreLocale(null);
    setErrore(null);
    setErroreStato(0);

    const validazione = validaFileLocale(scelto);
    if (!validazione.ok) {
      setErroreLocale(validazione.messaggio);
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
      setFase("anteprima");
    } catch (causa) {
      setErroreLocale(
        causa instanceof Error ? causa.message : "Immagine non leggibile."
      );
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const scelto = event.target.files?.[0] ?? null;
    event.target.value = "";
    void gestisciFile(scelto);
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
    <section className="rd-fascia p-5 md:p-8" aria-busy={fase === "analisi"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rd-occhiello">
            <ScanLine aria-hidden />
            Fotografia e verifica
          </p>
          <h2 className="rd-titolo-scheda mt-1 text-xl md:text-2xl">
            Analizza un prodotto
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#57534e]">
            Scatta o carica una foto dell&apos;etichetta. RadiciScan legge le
            informazioni visibili e le confronta con il registro delle fonti
            ufficiali.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5ded0] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b6459]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#24462f]" aria-hidden />
          Nessuna immagine conservata
        </span>
      </div>

      {erroreLocale ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{erroreLocale}</span>
        </div>
      ) : null}

      {fase === "inizio" ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setTrascinando(false)}
          className={`mt-5 rounded-2xl border-2 border-dashed p-5 text-center transition md:p-8 ${
            trascinando
              ? "border-[#d5a83a] bg-[#fbf6e8]"
              : "border-[#e5ded0] bg-[#fffdf7]"
          }`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#24462f] text-white shadow-[0_12px_24px_-16px_rgba(27,54,36,0.9)]">
            <ImagePlus className="h-6 w-6" aria-hidden />
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
            <label
              htmlFor={idFotocamera}
              className="rd-azione-tenue cursor-pointer px-5 py-2.5 sm:hidden"
            >
              <Camera className="h-4 w-4" aria-hidden />
              Scatta foto
            </label>
          </div>

          <p className="mt-3 text-xs leading-5 text-[#8a8378]">
            JPEG, PNG o WebP · ridotta a massimo 3 MB · la foto non viene conservata
          </p>

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

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-[#e8dfc9] bg-[#fbf6e8] p-3">
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
