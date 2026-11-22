import { ErroreRadiciScan, CODICI_ERRORE } from "./errori";
import type { ProviderRadiciScan } from "./tipi";

/**
 * Adapter RadiciScan verso Cloudflare Workers AI.
 *
 * Replica la chiamata già usata da Aggiungi prodotti
 * (`app/api/merchant/stores/[negozioId]/products/vision/route.ts`):
 * stesso modello, stesso endpoint OpenAI-compatibile e stesse credenziali
 * (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`). Il file di Aggiungi
 * prodotti non viene importato né modificato.
 */

export const MODELLO_CLOUDFLARE_RADISCAN = "@cf/google/gemma-4-26b-a4b-it";
const MAX_COMPLETION_TOKENS = 1200;
const TIMEOUT_PREDEFINITO_MS = 12_000;

export interface OpzioniCloudflareRadiciScan {
  accountId?: string;
  apiToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface RispostaChatCloudflare {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: string;
  }>;
  errors?: Array<{ message?: string }>;
}

function leggiCredenziali(opzioni: OpzioniCloudflareRadiciScan): {
  accountId: string;
  apiToken: string;
} {
  const accountId = (opzioni.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const apiToken = (opzioni.apiToken ?? process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (!accountId || !apiToken) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.PROVIDER_CONFIGURAZIONE,
      "Provider non configurato: credenziali Cloudflare assenti."
    );
  }
  return { accountId, apiToken };
}

export function creaProviderCloudflare(
  opzioni: OpzioniCloudflareRadiciScan = {}
): ProviderRadiciScan {
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_PREDEFINITO_MS;
  const fetchImpl = opzioni.fetchImpl ?? fetch;

  return {
    nome: "cloudflare",
    modello: MODELLO_CLOUDFLARE_RADISCAN,
    async genera({ prompt, immagineBase64, mimeType, immagineDettaglioBase64, signal }) {
      const { accountId, apiToken } = leggiCredenziali(opzioni);

      // Stesso contenuto usato da Aggiungi prodotti: testo + immagine come data URI.
      // Il dettaglio ingrandito, se presente, è un'immagine aggiuntiva della stessa confezione.
      const contenuto: Array<Record<string, unknown>> = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${immagineBase64}` } },
      ];
      if (immagineDettaglioBase64) {
        contenuto.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${immagineDettaglioBase64}` },
        });
      }

      const body = JSON.stringify({
        model: MODELLO_CLOUDFLARE_RADISCAN,
        messages: [{ role: "user", content: contenuto }],
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        temperature: 0.1,
        chat_template_kwargs: { enable_thinking: false },
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const annulla = () => controller.abort();
      signal?.addEventListener("abort", annulla, { once: true });

      try {
        if (signal?.aborted) controller.abort();
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
        const risposta = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body,
          signal: controller.signal,
        });

        const testoGrezzo = await risposta.text();
        if (!risposta.ok) {
          throw new ErroreRadiciScan(
            CODICI_ERRORE.PROVIDER_MODELLO,
            `Cloudflare: HTTP ${risposta.status}.`
          );
        }
        if (!testoGrezzo.trim()) {
          throw new ErroreRadiciScan(
            CODICI_ERRORE.PROVIDER_MODELLO,
            "Cloudflare: risposta vuota."
          );
        }

        let json: RispostaChatCloudflare;
        try {
          json = JSON.parse(testoGrezzo) as RispostaChatCloudflare;
        } catch {
          throw new ErroreRadiciScan(
            CODICI_ERRORE.PROVIDER_MODELLO,
            "Cloudflare: risposta non JSON."
          );
        }

        const testo = json.choices?.[0]?.message?.content;
        if (typeof testo !== "string" || !testo.trim()) {
          throw new ErroreRadiciScan(
            CODICI_ERRORE.PROVIDER_MODELLO,
            `Cloudflare: risposta senza testo (finish_reason: ${json.choices?.[0]?.finish_reason ?? "sconosciuto"}).`
          );
        }

        // Stessa pulizia di Aggiungi prodotti: rimuove eventuali fence markdown.
        const pulito = testo
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        return { testo: pulito, modello: MODELLO_CLOUDFLARE_RADISCAN };
      } catch (causa) {
        if (causa instanceof ErroreRadiciScan) throw causa;
        throw new ErroreRadiciScan(
          CODICI_ERRORE.PROVIDER_MODELLO,
          "Cloudflare: richiesta non completata (timeout o rete)."
        );
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", annulla);
      }
    },
  };
}
