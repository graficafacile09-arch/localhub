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
      (blob) => (blob ? resolve(blob) : reject(new Error("Impossibile elaborare l'immagine."))),
      type,
      quality
    );
  });
}

/**
 * Ridimensiona/ricomprime il file solo quando serve (sopra MAX_BYTES).
 * - file già leggero → restituito com'è (trasparenza e qualità originali);
 * - file grande con trasparenza → WebP (o PNG come ripiego), alpha preservato;
 * - file grande senza trasparenza → JPEG con sfondo bianco.
 */
async function prepareImage(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file;

  const img = await loadImage(file);

  const ratio = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight, 1);
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile nel browser.");

  const hasAlpha = file.type === "image/png" || file.type === "image/webp";

  let outType: string;
  if (hasAlpha && supportsWebP()) outType = "image/webp";
  else if (hasAlpha) outType = "image/png";
  else outType = "image/jpeg";

  if (!hasAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  let lastBlob: Blob | null = null;
  for (let quality = 0.85; quality >= 0.55; quality -= 0.1) {
    const blob = await canvasToBlob(canvas, outType, quality);
    lastBlob = blob;
    if (blob.size <= MAX_BYTES) break;
  }

  if (!lastBlob || lastBlob.size > MAX_BYTES) {
    throw new Error(
      "L'immagine è troppo grande anche dopo l'ottimizzazione. Riduci la risoluzione."
    );
  }

  const ext =
    (lastBlob.type || outType) === "image/jpeg"
      ? "jpg"
      : (lastBlob.type || outType) === "image/webp"
        ? "webp"
        : "png";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([lastBlob], `${baseName}.${ext}`, { type: lastBlob.type || outType });
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
export async function uploadStoreImage(storeId: string, file: File): Promise<string> {
  const prepared = await prepareImage(file);

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
