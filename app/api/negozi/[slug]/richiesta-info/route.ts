import { apiError, apiOk } from "@/lib/api/response";
import { risolviNegozioPubblico } from "@/lib/negozi";
import { getModuliAttiviNegozio } from "@/lib/profili-attivita";
import type { Negozio } from "@/types/negozio";
import {
  getConfigRichiestaInfo,
  inviaRichiestaInfoEmail,
  type TipoRichiestaInfo,
} from "@/lib/negozio/richiesta-info";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPI: TipoRichiestaInfo[] = ["informazioni", "preventivo", "consulenza"];
const MAX_RICHIESTE_PER_ORA_IP = 5;

/** Rate limit in-memory per IP (stesso pattern di /api/assistente). */
const richiestePerIp = new Map<string, number[]>();

function rateLimitOk(ip: string): boolean {
  const ora = Date.now();
  const finestra = 3_600_000; // 1h

  if (richiestePerIp.size > 10_000) {
    for (const [chiave, arr] of richiestePerIp) {
      const vivi = arr.filter((t) => ora - t < finestra);
      if (vivi.length === 0) richiestePerIp.delete(chiave);
    }
  }

  const vivi = (richiestePerIp.get(ip) ?? []).filter((t) => ora - t < finestra);
  if (vivi.length >= MAX_RICHIESTE_PER_ORA_IP) return false;
  vivi.push(ora);
  richiestePerIp.set(ip, vivi);
  return true;
}

function ipRichiedente(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * POST /api/negozi/[slug]/richiesta-info
 *
 * Canale cliente → attività (Fase 4). Il negozio deve esistere, essere attivo,
 * avere il modulo `richiesta_info` nei `moduli_attivi` e la configurazione
 * `data.richiesta_info.attiva === true`. Validazione SERVER-SIDE completa;
 * honeypot nascosto (website/company/fax); rate limit per IP; invio email
 * al merchant best-effort (Resend). Nessuna tabella: nessun lead persistito.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  // Rate limit per IP (best-effort).
  if (!rateLimitOk(ipRichiedente(request))) {
    return apiError(
      "RATE_LIMITED",
      "Troppe richieste in poco tempo. Riprova tra qualche minuto.",
      429
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  // Honeypot anti-bot: campi nascosti che solo i bot compilano.
  const honeypot = ["website", "company", "fax"].some(
    (k) => typeof body[k] === "string" && body[k].trim() !== ""
  );
  if (honeypot) {
    return apiError("VALIDATION_ERROR", "Richiesta non valida.", 400);
  }

  // Il negozio deve esistere ed essere attivo.
  const { negozio } = await risolviNegozioPubblico(slug);
  if (!negozio || negozio.attivo !== true) {
    return apiError("NOT_FOUND", "Negozio non trovato.", 404);
  }

  // Modulo richiesta-info attivo (STESSA risoluzione dell'editor: priorità a
  // data.tipo_attivita → profilo, fallback su moduli_attivi grezzi).
  const moduliAttivi: string[] = getModuliAttiviNegozio(negozio as Negozio) ?? [];
  if (!moduliAttivi.includes("richiesta_info")) {
    return apiError(
      "MODULE_INACTIVE",
      "Questo negozio non accetta richieste di informazioni.",
      403
    );
  }

  const config = getConfigRichiestaInfo(
    (negozio.data ?? {}) as Record<string, unknown>
  );
  if (!config.attiva) {
    return apiError(
      "MODULE_INACTIVE",
      "Le richieste di informazioni non sono attive per questo negozio.",
      403
    );
  }

  // Validazione SERVER-SIDE (mai fidarsi del client).
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
  const messaggio = typeof body.messaggio === "string" ? body.messaggio.trim() : "";
  const tipo: TipoRichiestaInfo = TIPI.includes(body.tipo as TipoRichiestaInfo)
    ? (body.tipo as TipoRichiestaInfo)
    : config.tipo;

  if (!nome || nome.length > 200) {
    return apiError("VALIDATION_ERROR", "Inserisci il tuo nome.", 422);
  }
  if (config.email_obbligatoria && !email) {
    return apiError("VALIDATION_ERROR", "Inserisci la tua email.", 422);
  }
  if (email && !EMAIL_RE.test(email)) {
    return apiError("VALIDATION_ERROR", "Email non valida.", 422);
  }
  if (config.telefono_obbligatorio && !telefono) {
    return apiError("VALIDATION_ERROR", "Inserisci il tuo telefono.", 422);
  }
  if (telefono && telefono.length > 30) {
    return apiError("VALIDATION_ERROR", "Telefono non valido.", 422);
  }
  if (config.messaggio_obbligatorio && !messaggio) {
    return apiError("VALIDATION_ERROR", "Inserisci il messaggio.", 422);
  }
  if (messaggio.length > 5000) {
    return apiError("VALIDATION_ERROR", "Messaggio troppo lungo.", 422);
  }
  // Almeno un recapito disponibile (email o telefono).
  if (!email && !telefono) {
    return apiError(
      "VALIDATION_ERROR",
      "Inserisci almeno un recapito (email o telefono).",
      422
    );
  }

  // Destinatario: email ufficiale del negozio. Nessun fallback inventato.
  const destinatario = (negozio.email_negozio as string | null)?.trim();
  if (!destinatario) {
    return apiError(
      "NO_DESTINATION",
      "Questo negozio non ha configurato un contatto email per ricevere richieste.",
      422
    );
  }

  const esito = await inviaRichiestaInfoEmail(
    destinatario,
    String(negozio.nome ?? ""),
    {
      nome,
      email: email || null,
      telefono: telefono || null,
      messaggio,
      tipo,
      pagina_origine:
        typeof body.pagina_origine === "string"
          ? body.pagina_origine.slice(0, 500)
          : null,
      oggetto_riferimento:
        typeof body.oggetto_riferimento === "string"
          ? body.oggetto_riferimento.slice(0, 300)
          : null,
      oggetto_tipo:
        typeof body.oggetto_tipo === "string" ? body.oggetto_tipo.slice(0, 100) : null,
      oggetto_id:
        typeof body.oggetto_id === "string" ? body.oggetto_id.slice(0, 200) : null,
    }
  );

  if (esito.stato === "error") {
    // Best-effort: la richiesta è comunque accettata, l'errore viene loggato.
    console.error("[richiesta-info] notifica non inviata:", esito.motivo);
  }

  return apiOk({ inviata: true, notifica: esito.stato });
}
