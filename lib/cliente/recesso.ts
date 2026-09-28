import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const GIORNI_RECESSO = 14;

export type StatoRichiestaRecesso =
  | "richiesta"
  | "presa_in_carico"
  | "istruzioni_reso"
  | "reso_ricevuto"
  | "rimborso_in_elaborazione"
  | "rimborsata"
  | "rifiutata"
  | "annullata"
  | "chiusa";

export type RecessoRigaInfo = {
  ordineRigaId: string;
  prodottoId: string;
  nomeProdotto: string;
  prezzoUnitario: number;
  quantitaOrdine: number;
  quantitaGiaRichiesta: number;
  quantitaDisponibile: number;
  recessoApplicabile: boolean | null;
  esclusioneCodice: string | null;
  esclusioneDettaglio: string | null;
};

export type RecessoRichiestaInfo = {
  id: string;
  numero: string;
  stato: StatoRichiestaRecesso;
  richiestaAt: string;
  ricevutaAt: string;
  decorrenzaAt: string | null;
  termineRecessoAt: string | null;
};

export type RecessoInfo = {
  visibile: boolean;
  puòRichiedere: boolean;
  motivoNonDisponibile: string | null;
  ordineNumero: string;
  ordineStato: string;
  consegnataAt: string | null;
  termineRecessoAt: string | null;
  righe: RecessoRigaInfo[];
  richiestaAttiva: RecessoRichiestaInfo | null;
  clienteEmail: string | null;
  clienteTelefono: string | null;
};

type AccessoRecesso =
  | { clienteUserId: string; guestAutorizzato?: false }
  | { clienteUserId: null; guestAutorizzato: true };

type RisultatoCreazione =
  | {
      ok: true;
      richiesta: RecessoRichiestaInfo & {
        importoPrevisto: number | null;
        giaEsistente: boolean;
      };
      clienteEmail: string | null;
      ordineId: string;
      ordineNumero: string;
      negozioNome: string;
    }
  | { ok: false; codice: string; messaggio: string; status: number };

function esito(codice: string, messaggio: string, status: number): RisultatoCreazione {
  return { ok: false, codice, messaggio, status };
}

function normalizzaEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizzaTelefono(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^0-9]/g, "") : "";
}

function dataLocale(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function etichettaEsclusioneRecesso(codice: string | null): string | null {
  switch (codice) {
    case "prodotto_personalizzato":
      return "Prodotto personalizzato";
    case "prodotto_deperibile":
      return "Bene soggetto a deterioramento";
    case "bene_sigillato_igiene_salute":
      return "Bene sigillato non restituibile per motivi di igiene o salute";
    case "servizio_tempo_libero_data_specifica":
      return "Servizio per una data o periodo specifico";
    case "contenuto_digitale_avviato":
      return "Contenuto digitale già iniziato con consenso";
    case "servizio_urgente_su_richiesta":
      return "Servizio eseguito su richiesta specifica";
    case "altra_esclusione_prevista":
      return "Esclusione prevista dalla normativa applicabile";
    default:
      return null;
  }
}

async function caricaOrdine(ordineId: string) {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("ordini")
    .select("id, numero, stato, cliente_user_id, cliente_email, cliente_telefono, negozio_nome, consegnata_at")
    .eq("id", ordineId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Record<string, unknown>;
}

async function autorizzaOrdine(
  ordine: Record<string, unknown>,
  accesso: AccessoRecesso,
): Promise<boolean> {
  if (accesso.guestAutorizzato) return true;
  return String(ordine.cliente_user_id ?? "") === accesso.clienteUserId;
}

export async function getRecessoInfo(
  ordineId: string,
  accesso: AccessoRecesso,
): Promise<RecessoInfo | null> {
  if (!ordineId) return null;

  const db = createAdminSupabaseClient();
  const ordine = await caricaOrdine(ordineId);
  if (!ordine || !(await autorizzaOrdine(ordine, accesso))) return null;

  const consegnataAt = typeof ordine.consegnata_at === "string" ? ordine.consegnata_at : null;
  const termine = consegnataAt
    ? new Date(new Date(consegnataAt).getTime() + GIORNI_RECESSO * 86400000)
    : null;
  const scaduto = Boolean(termine && Date.now() > termine.getTime());

  const { data: richieste } = await db
    .from("richieste_recesso")
    .select("id, numero, stato, richiesta_at, ricevuta_at, decorrenza_at, termine_recesso_at")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: false });

  const requestRows = (richieste ?? []) as Record<string, unknown>[];
  const attiva = requestRows.find((r) =>
    !["rimborsata", "rifiutata", "annullata", "chiusa"].includes(String(r.stato))
  ) ?? null;

  const ids = requestRows.map((r) => String(r.id)).filter(Boolean);
  const quantitaUsata = new Map<string, number>();
  if (ids.length > 0) {
    const { data: rr } = await db
      .from("richieste_recesso_righe")
      .select("ordine_riga_id, quantita_richiesta, richiesta_id")
      .in("richiesta_id", ids);

    for (const r of (rr ?? []) as Record<string, unknown>[]) {
      const stato = requestRows.find((h) => String(h.id) === String(r.richiesta_id))?.stato;
      if (stato === "rifiutata" || stato === "annullata") continue;
      const key = String(r.ordine_riga_id);
      quantitaUsata.set(key, (quantitaUsata.get(key) ?? 0) + Number(r.quantita_richiesta ?? 0));
    }
  }

  const { data: righe } = await db
    .from("ordini_righe")
    .select("id, prodotto_id, nome_prodotto, prezzo_unitario, quantita, recesso_applicabile, recesso_esclusione_codice, recesso_esclusione_dettaglio")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: true });

  const righeInfo: RecessoRigaInfo[] = ((righe ?? []) as Record<string, unknown>[]).map((r) => {
    const gia = quantitaUsata.get(String(r.id)) ?? 0;
    const ordinata = Number(r.quantita ?? 0);
    return {
      ordineRigaId: String(r.id),
      prodottoId: String(r.prodotto_id),
      nomeProdotto: String(r.nome_prodotto ?? "Prodotto"),
      prezzoUnitario: Number(r.prezzo_unitario ?? 0),
      quantitaOrdine: ordinata,
      quantitaGiaRichiesta: gia,
      quantitaDisponibile: Math.max(0, ordinata - gia),
      recessoApplicabile:
        r.recesso_applicabile === null || r.recesso_applicabile === undefined
          ? null
          : Boolean(r.recesso_applicabile),
      esclusioneCodice: (r.recesso_esclusione_codice as string | null) ?? null,
      esclusioneDettaglio: (r.recesso_esclusione_dettaglio as string | null) ?? null,
    };
  });

  const erroreRighe = righeInfo.find((r) => r.recessoApplicabile === null);
  const eleggibili = righeInfo.filter(
    (r) => r.recessoApplicabile === true && r.quantitaDisponibile > 0
  );

  let motivoNonDisponibile: string | null = null;
  if (String(ordine.stato) === "cancellato") {
    motivoNonDisponibile = "Ordine annullato.";
  } else if (scaduto) {
    motivoNonDisponibile = "Il termine ordinario per il recesso risulta scaduto.";
  } else if (attiva) {
    motivoNonDisponibile = null;
  } else if (erroreRighe) {
    motivoNonDisponibile =
      "Per questo ordine non è disponibile una configurazione storica del recesso per tutti gli articoli.";
  } else if (eleggibili.length === 0) {
    motivoNonDisponibile = "Non risultano articoli attualmente disponibili per una nuova richiesta di recesso.";
  }

  const puòRichiedere =
    !attiva &&
    !scaduto &&
    String(ordine.stato) !== "cancellato" &&
    eleggibili.length > 0 &&
    !erroreRighe;

  const visibile = Boolean(attiva || puòRichiedere || motivoNonDisponibile);

  const richiestaAttiva = attiva
    ? {
        id: String(attiva.id),
        numero: String(attiva.numero),
        stato: String(attiva.stato) as StatoRichiestaRecesso,
        richiestaAt: String(attiva.richiesta_at),
        ricevutaAt: String(attiva.ricevuta_at),
        decorrenzaAt: attiva.decorrenza_at ? String(attiva.decorrenza_at) : null,
        termineRecessoAt: attiva.termine_recesso_at ? String(attiva.termine_recesso_at) : null,
      }
    : null;

  return {
    visibile,
    puòRichiedere,
    motivoNonDisponibile,
    ordineNumero: String(ordine.numero ?? ""),
    ordineStato: String(ordine.stato ?? ""),
    consegnataAt: consegnataAt,
    termineRecessoAt: termine ? termine.toISOString() : null,
    righe: righeInfo,
    richiestaAttiva,
    clienteEmail: (ordine.cliente_email as string | null) ?? null,
    clienteTelefono: (ordine.cliente_telefono as string | null) ?? null,
  };
}

export async function creaRichiestaRecesso(
  ordineId: string,
  accesso: AccessoRecesso,
  righe: Array<{ ordineRigaId: string; quantita: number }>,
  motivo?: string | null,
  note?: string | null,
): Promise<RisultatoCreazione> {
  const db = createAdminSupabaseClient();

  const ordine = await caricaOrdine(ordineId);
  if (!ordine || !(await autorizzaOrdine(ordine, accesso))) {
    return esito("FORBIDDEN", "Non puoi gestire il recesso di questo ordine.", 403);
  }

  const payload = righe.map((r) => ({
    ordineRigaId: String(r.ordineRigaId),
    quantita: Number(r.quantita),
  }));

  if (payload.length === 0) {
    return esito("VALIDATION_ERROR", "Seleziona almeno un articolo.", 422);
  }

  const { data, error } = await db.rpc("crea_richiesta_recesso", {
    p_ordine_id: ordineId,
    p_cliente_user_id: accesso.guestAutorizzato ? null : accesso.clienteUserId,
    p_guest_email: accesso.guestAutorizzato ? normalizzaEmail(ordine.cliente_email) : null,
    p_guest_telefono: accesso.guestAutorizzato ? normalizzaTelefono(ordine.cliente_telefono) : null,
    p_righe: payload,
    p_motivo: typeof motivo === "string" ? motivo.trim().slice(0, 500) : null,
    p_note: typeof note === "string" ? note.trim().slice(0, 1500) : null,
  });

  if (error) {
    console.error("[recesso] RPC crea_richiesta_recesso:", error.message);
    return esito("SAVE_FAILED", "Impossibile registrare la richiesta di recesso.", 500);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const codice = String(result.codice ?? "SAVE_FAILED");
    const status =
      codice === "FORBIDDEN" ? 403 :
      codice === "ORDINE_NON_TROVATO" ? 404 :
      codice === "FUORI_TERMINE" ? 409 :
      codice === "RECESSO_ESCLUSO" ? 409 :
      codice === "RECESSO_NON_CONFIGURATO" ? 409 :
      codice === "QUANTITA_NON_VALIDA" || codice === "QUANTITA_GIA_RICHIESTA" ? 409 :
      codice === "VALIDATION_ERROR" ? 422 : 500;
    return esito(codice, String(result.messaggio ?? "Impossibile registrare la richiesta di recesso."), status);
  }

  return {
    ok: true,
    richiesta: {
      id: String(result.id),
      numero: String(result.numero),
      stato: String(result.stato) as StatoRichiestaRecesso,
      richiestaAt: String(result.richiestaAt),
      ricevutaAt: String(result.ricevutaAt),
      decorrenzaAt: result.decorrenzaAt ? String(result.decorrenzaAt) : null,
      termineRecessoAt: result.termineRecessoAt ? String(result.termineRecessoAt) : null,
      importoPrevisto: result.importoPrevisto == null ? null : Number(result.importoPrevisto),
      giaEsistente: Boolean(result.giaEsistente),
    },
    clienteEmail: (ordine.cliente_email as string | null) ?? null,
    ordineId,
    ordineNumero: String(ordine.numero ?? ""),
    negozioNome: String(ordine.negozio_nome ?? ""),
  };
}

export function formattaDataRecesso(value: string | null): string {
  return dataLocale(value) ?? "";
}
