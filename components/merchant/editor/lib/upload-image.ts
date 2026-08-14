"use client";

/** Carica un'immagine (File) nello storage del negozio e restituisce l'URL pubblico. */
export async function uploadStoreImage(
  storeId: string,
  file: File,
  folder: string
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Impossibile leggere l'immagine."));
    reader.readAsDataURL(file);
  });

  const res = await fetch(`/api/merchant/stores/${storeId}/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl, name: folder }),
  });

  const json = await res.json();
  if (!res.ok || !json.success || !json.data?.url) {
    throw new Error(json.error?.message ?? "Caricamento immagine non riuscito.");
  }
  return json.data.url as string;
}
