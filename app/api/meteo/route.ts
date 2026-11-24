import { apiError, apiOk } from "@/lib/api/response";

/**
 * GET /api/meteo
 *
 * Meteo attuale a Castrovillari per il widget dell'header.
 *
 * Il widget chiamava Open-Meteo direttamente dal browser: se la rete
 * dell'utente (proxy aziendale, ad-blocker, DNS) non raggiunge il dominio
 * esterno la richiesta falliva in silenzio e il widget spariva. Passando da
 * questa route la richiesta parte dal nostro stesso origin, quindi il widget
 * compare ovunque il sito sia raggiungibile.
 *
 * Cache in memoria per istanza: 10 minuti con dati validi, 2 minuti per
 * ritentare prima quando la fonte non risponde.
 */
const URL_OPEN_METEO =
  "https://api.open-meteo.com/v1/forecast?latitude=39.817&longitude=16.202&current=temperature_2m,weather_code";

const TTL_VALIDO_MS = 10 * 60 * 1000;
const TTL_VUOTO_MS = 2 * 60 * 1000;

type Meteo = { temperatura: number; codice: number };

let cache: { dati: Meteo; scadeIl: number } | null = null;

async function leggiOpenMeteo(): Promise<Meteo | null> {
  try {
    const risposta = await fetch(URL_OPEN_METEO, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!risposta.ok) return null;

    const json = (await risposta.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temperatura = Math.round(Number(json?.current?.temperature_2m));
    const codice = Number(json?.current?.weather_code);
    if (!Number.isFinite(temperatura) || !Number.isFinite(codice)) return null;

    return { temperatura, codice };
  } catch {
    return null;
  }
}

export async function GET() {
  const ora = Date.now();
  if (!cache || ora >= cache.scadeIl) {
    const dati = await leggiOpenMeteo();
    if (dati) {
      cache = { dati, scadeIl: ora + TTL_VALIDO_MS };
    } else if (cache) {
      // Fonte momentaneamente irraggiungibile: si continua a servire l'ultimo
      // valore noto invece di far sparire il widget.
      cache = { dati: cache.dati, scadeIl: ora + TTL_VUOTO_MS };
    } else {
      cache = null;
    }
  }

  if (!cache) {
    return apiError("METEO_NON_DISPONIBILE", "Meteo non disponibile.", 503);
  }

  return apiOk(cache.dati);
}
