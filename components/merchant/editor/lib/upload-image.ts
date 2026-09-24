"use client";

/**
 * Caricamento immagini dell'editor negozio.
 *
 * Il vecchio flusso inviava l'immagine come data URL base64 in un body JSON
 * verso `/gallery`: per foto anche solo medie la stringa base64 superava il
 * limite del body della piattaforma, il server rispondeva con una pagina non
 * JSON e `res.json()` lanciava "JSON parse: Unexpected character...".
 *
 * Ora usiamo il contratto già esistente e corretto: `POST /api/merchant/
 * stores/{id}/media` in multipart/form-data, che salva il file nello Storage
 * e nella tabella `media` e restituisce SEMPRE JSON. Prima dell'upload il file
 * viene compresso/ridimensionato lato client per restare sotto i limiti,
 * preservando la trasparenza quando presente.
 */

const MAX_DIM = 2000;
const MAX_BYTES = 3.5 * 1024 * 1024;

export type StoreImagePreset = "logo" | "copertina" | "galleria";

type ImagePresetConfig = {
  width: number;
  height: number;
  mode: "contain" | "cover" | "limit";
};

const PRESET: Record<StoreImagePreset, ImagePresetConfig> = {
  // Logo: quadrato fisso, adatto al rendering circolare accanto al nome.
  logo: { width: 512, height: 512, mode: "contain" },
  // Copertina: formato fisso 16:9 per una cover leggera e uniforme.
  copertina: { width: 1600, height: 900, mode: "cover" },
  // Galleria: mantiene il comportamento precedente con un tetto massimo.
  galleria: { width: MAX_DIM, height: MAX_DIM, mode: "limit" },
};

function supportsWebP(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere l'immagine."));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Impossibile elaborare l'immagine.")),
      type,
      quality
    );
  });
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  alphaBackground: boolean
) {
  if (alphaBackground) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  const ratio = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const x = Math.round((width - w) / 2);
  const y = Math.round((height - h) / 2);
  ctx.drawImage(img, x, y, w, h);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const ratio = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const x = Math.round((width - w) / 2);
  const y = Math.round((height - h) / 2);
  ctx.drawImage(img, x, y, w, h);
}

/**
 * Normalizza SEMPRE logo/copertina a una risoluzione fissa.
 * Per la galleria mantiene il precedente tetto massimo.
 */
async function prepareImage(
  file: File,
  preset: StoreImagePreset = "galleria"
): Promise<File> {
  const config = PRESET[preset];

  // Solo la galleria può conservare il file originale se è già entro i limiti.
  // Logo e copertina vengono invece sempre normalizzati alla dimensione prevista.
  if (config.mode === "limit" && file.size <= MAX_BYTES) return file;

  const img = await loadImage(file);

  let width = config.width;
  let height = config.height;

  if (config.mode === "limit") {
    const ratio = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight, 1);
    width = Math.max(1, Math.round(img.naturalWidth * ratio));
    height = Math.max(1, Math.round(img.naturalHeight * ratio));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile nel browser.");

  const originalHasAlpha = file.type === "image/png" || file.type === "image/webp";
  const preserveAlpha = preset === "logo" && originalHasAlpha;

  if (config.mode === "contain") {
    drawContain(ctx, img, width, height, preserveAlpha);
  } else {
    drawCover(ctx, img, width, height);
  }

  const outType =
    preserveAlpha && supportsWebP() ? "image/webp" : "image/jpeg";

  let lastBlob: Blob | null = null;
  const minQuality = preset === "copertina" ? 0.60 : 0.55;
  for (let quality = 0.85; quality >= minQuality; quality -= 0.1) {
    const blob = await canvasToBlob(canvas, outType, quality);
    lastBlob = blob;
    if (blob.size <= MAX_BYTES) break;
  }

  if (!lastBlob || lastBlob.size > MAX_BYTES) {
    throw new Error(
      "L'immagine è troppo grande anche dopo l'ottimizzazione. Riduci la risoluzione."
    );
  }

  const ext = (lastBlob.type || outType) === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([lastBlob], `${baseName}-${preset}.${ext}`, {
    type: lastBlob.type || outType,
  });
}

/** Legge il body e lo interpreta come JSON senza lanciare errori da `res.json()`. */
async function parseJsonSafe(res: Response): Promise<{
  success?: boolean;
  data?: { media?: { public_url?: string } };
  error?: { message?: string };
} | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Risposta non-JSON (HTML/redirect/errore di piattaforma): non fare mai
    // crashare il client con un "JSON parse", segnala un errore chiaro.
    return null;
  }
}

/**
 * Carica un'immagine nel negozio (Storage + tabella `media`) e restituisce
 * l'URL pubblico persistente da salvare in `negozi.logo_url` /
 * `negozi.copertina_url` / `negozi.galleria`.
 */
export async function uploadStoreImage(
  storeId: string,
  file: File,
  preset: StoreImagePreset = "galleria"
): Promise<string> {
  const prepared = await prepareImage(file, preset);

  const formData = new FormData();
  formData.append("file", prepared);

  let res: Response;
  try {
    res = await fetch(`/api/merchant/stores/${storeId}/media`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Errore di connessione durante il caricamento dell'immagine.");
  }

  const json = await parseJsonSafe(res);

  if (!res.ok || !json?.success || !json.data?.media?.public_url) {
    const message =
      json?.error?.message ??
      (res.status === 413
        ? "Il file supera il limite consentito dalla piattaforma (4 MB)."
        : `Caricamento non riuscito (errore ${res.status}).`);
    throw new Error(message);
  }

  return json.data.media.public_url;
}
