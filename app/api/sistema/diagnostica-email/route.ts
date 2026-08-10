import { requireApiArea } from "@/lib/auth/session-area";
import { apiError, apiOk } from "@/lib/api/response";

/**
 * GET /api/sistema/diagnostica-email
 *
 * DIAGNOSTICA EMAIL (solo admin) — verifica CONFIGURAZIONE REALE in
 * produzione senza esporre segreti. Restituisce solo informazioni non
 * sensibili:
 *   - presenza/formato della RESEND_API_KEY (mai il valore);
 *   - dominio del mittente (RESEND_FROM_EMAIL) e sua validità;
 *   - domini registrati nel progetto Resend e loro STATO DI VERIFICA
 *     (la causa più comune delle email che non arrivano);
 *   - storico degli ultimi invii (conteggio totale + ultimi 5 con
 *     destinatario mascherato ed evento di consegna);
 *
 * GET /api/sistema/diagnostica-email?test=email@esempio.it
 *   Invia una EMAIL REALE di prova al destinatario indicato (best-effort,
 *   stessa identica chiamata Resend usata dal flusso ordini) e riporta la
 *   risposta di Resend. Se il dominio del mittente non è verificato, la
 *   risposta contiene l'errore esatto: la verifica definitiva del fix.
 */

function estraiDominio(from: string): string | null {
  let raw = from.trim();
  const m = raw.match(/<([^>]+)>/);
  if (m) raw = m[1].trim();
  const at = raw.lastIndexOf("@");
  if (at === -1 || at === raw.length - 1) return null;
  return raw.slice(at + 1).toLowerCase();
}

function maschera(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 2)}***@${email.slice(at + 1)}`;
}

const TIMEOUT_MS = 8_000;

async function chiamaResend(path: string, opts: RequestInit = {}) {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(opts.headers ?? {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, json: null, errore: (err as Error)?.message ?? "errore di rete" };
  }
}

export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM_EMAIL ?? "";
  const dominio = estraiDominio(from);
  const url = new URL(request.url);
  const testEmail = url.searchParams.get("test")?.trim() ?? "";

  // ── Invio REALE di prova (solo se richiesto esplicitamente) ──────────────
  if (testEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      return apiError("VALIDATION_ERROR", "Indirizzo di prova non valido.", 422);
    }
    const esitoTest = await chiamaResend("/emails", {
      method: "POST",
      body: JSON.stringify({
        from,
        to: [testEmail],
        subject: `Test email InCittà — ${new Date().toISOString()}`,
        html: "<p>Questa è un'email di prova inviata da InCittà per verificare la configurazione Resend.</p>",
      }),
    });
    return apiOk({
      test: {
        destinatario: maschera(testEmail),
        rispostaResend: esitoTest.status,
        esito: esitoTest.status === 200 ? "inviata" : "rifiutata",
        errore: esitoTest.json?.message ?? esitoTest.errore ?? null,
      },
    });
  }

  // ── Diagnostica di configurazione ─────────────────────────────────────────
  const esito: Record<string, unknown> = {
    chiaveConfigurata: apiKey.length > 0,
    formatoChiave: apiKey.startsWith("re_")
      ? "valida (prefisso re_)"
      : apiKey.length > 0
        ? "diversa_dal_standard"
        : "assente",
    mittente: from.length > 0
      ? dominio
        ? `valido (dominio: ${dominio})`
        : "formato_non_valido"
      : "assente",
  };

  if (apiKey.length > 0) {
    const domini = await chiamaResend("/domains");
    esito.apiResend = {
      status: domini.status,
      rispostaValida: domini.status === 200,
      errore: domini.json?.message ?? domini.errore ?? null,
    };
    const elenco = (domini.json?.data ?? []) as Array<{ name?: string; status?: string }>;
    esito.dominiRegistrati = elenco.map((d) => ({
      dominio: d.name ?? "",
      statoVerifica: d.status ?? "sconosciuto",
    }));
    if (elenco.length === 0) {
      esito.avvisoDominio =
        "Nessun dominio registrato nel progetto Resend: se RESEND_FROM_EMAIL non usa un dominio verificato, Resend rifiuta ogni invio (le email non arrivano mai).";
    }

    const invii = await chiamaResend("/emails?limit=10");
    const elencoInvii = (invii.json?.data ?? []) as Array<{
      id?: string;
      subject?: string | null;
      to?: unknown;
      last_event?: string | null;
      created_at?: string | null;
    }>;
    esito.emailInviateTotale = elencoInvii.length;
    esito.ultimiInvii = elencoInvii.slice(0, 5).map((e) => ({
      data: (e.created_at ?? "").slice(0, 19),
      oggetto: (e.subject ?? "(senza oggetto)").slice(0, 60),
      destinatario: maschera(String(Array.isArray(e.to) ? e.to[0] : (e.to ?? ""))),
      evento: e.last_event ?? "?",
      id: (e.id ?? "").slice(0, 8),
    }));
  }

  return apiOk(esito);
}
