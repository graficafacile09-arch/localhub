import { isAdminEmail, type RuoloUtente } from "@/lib/auth/roles";

/**
 * AREA ATTIVA DELLA SESSIONE (cookie httpOnly "lh_area").
 *
 * L'area viene SCELTA al login (Accedi come Cliente/Venditore/Amministrazione)
 * e resta FISSA per tutta la sessione: non esiste alcuno switch di area senza
 * logout. Da quel momento l'utente vede SOLO la propria area, anche se il suo
 * account possiede altri ruoli.
 *
 * Il cookie è httpOnly: il browser NON può leggerlo né modificarlo. L'unico
 * modo per cambiare area è fare logout e rientrare dall'ingresso corretto.
 */
export type AreaAttiva = "cliente" | "merchant" | "admin";

/** Nome del cookie che conserva l'area attiva della sessione. */
export const AREA_COOKIE = "lh_area";

const AREE_VALIDE: readonly AreaAttiva[] = ["cliente", "merchant", "admin"];

export function isAreaAttiva(
  value: string | null | undefined
): value is AreaAttiva {
  return AREE_VALIDE.includes(value as AreaAttiva);
}

/** Percorso di atterraggio di un'area. */
export function areaToPath(area: AreaAttiva): string {
  switch (area) {
    case "admin":
      return "/amministratore";
    case "merchant":
      return "/merchant";
    case "cliente":
      return "/cliente";
  }
}

/**
 * Opzioni del cookie lh_area: httpOnly (mai leggibile dal JS del browser),
 * sameSite lax, secure in produzione.
 */
export function areaCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/**
 * Area "propria" di un utente, derivata dai ruoli quando non sceglie
 * esplicitamente (login senza ?area=, sessioni legacy senza cookie).
 * Ordine di priorità: admin AUTORIZZATO (email + ruolo) → merchant → customer.
 */
export function areaPerRuoli(
  email: string,
  ruoli: readonly RuoloUtente[]
): AreaAttiva | null {
  if (ruoli.includes("admin") && isAdminEmail(email)) return "admin";
  if (ruoli.includes("merchant")) return "merchant";
  if (ruoli.includes("customer")) return "cliente";
  return null;
}

/**
 * Area che l'utente OTTIENE realmente per una determinata richiesta:
 * - Se l'area richiesta è consentita (ruolo corrispondente; per admin anche
 *   l'email autorizzata) → l'area richiesta stessa.
 * - Altrimenti → l'area di ripiego derivata dai ruoli (areaPerRuoli).
 * - Nessun ruolo utile → null.
 *
 * Usata al LOGIN per validare la scelta dell'ingresso: un venditore che entra
 * da "Accedi come Cliente" ottiene una sessione cliente; un utente che prova
 * l'ingresso Amministrazione senza essere l'admin autorizzato NON ottiene una
 * sessione admin (ripiega sulla propria area).
 */
export function areaEffettiva(
  email: string,
  ruoli: readonly RuoloUtente[],
  areaRichiesta: AreaAttiva
): AreaAttiva | null {
  const ha = (ruolo: RuoloUtente) => ruoli.includes(ruolo);
  const consentita =
    areaRichiesta === "admin"
      ? ha("admin") && isAdminEmail(email)
      : areaRichiesta === "merchant"
        ? ha("merchant")
        : ha("customer");
  if (consentita) return areaRichiesta;
  return areaPerRuoli(email, ruoli);
}

/**
 * Coerenza SESSIONE → RICHIESTA (usata da proxy, layout e API):
 * l'area della SESSIONE deve coincidere con l'area RICHIESTA e l'utente
 * deve possedere il ruolo corrispondente (per admin anche l'email
 * autorizzata). Nessuna richiesta può uscire dall'area della sessione:
 * - sessione merchant → API/pagine admin = 403 (anche se ha altri ruoli)
 * - sessione cliente  → API/pagine merchant e admin = 403
 * - sessione admin    → solo email autorizzata + ruolo admin; l'admin
 *   autorizzato gestisce QUALSIASI negozio con l'editor del venditore,
 *   quindi gli è consentita anche l'area "merchant" (risorse negozi).
 *   La direzione inversa resta vietata: nessun merchant/cliente può usare
 *   risorse admin.
 */
export function areaConsenteAccesso(
  email: string,
  ruoli: readonly RuoloUtente[],
  areaSessione: AreaAttiva,
  areaRichiesta: AreaAttiva
): boolean {
  if (areaSessione === "admin") {
    const adminOk = ruoli.includes("admin") && isAdminEmail(email);
    if (!adminOk) return false;
    // L'admin autorizzato ha accesso sia alle risorse di piattaforma (admin)
    // sia alla gestione dei negozi (merchant) tramite l'editor condiviso.
    return areaRichiesta === "admin" || areaRichiesta === "merchant";
  }
  if (areaSessione !== areaRichiesta) return false;
  if (areaSessione === "merchant") {
    return ruoli.includes("merchant");
  }
  return ruoli.includes("customer");
}

export type AreaRisolta = {
  /** Area di sessione effettiva (null se l'utente non ha alcuna area). */
  area: AreaAttiva | null;
  /** True se il cookie va riscritto (mancante, invalido o non più consentito). */
  correzione: boolean;
};

/**
 * Risolve l'area di SESSIONE di un utente autenticato:
 * - cookie valido E ancora consentito → si usa quello (nessuna correzione);
 * - cookie mancante/invalido/non più consentito → si usa l'area derivata dai
 *   ruoli e si segnala la correzione (il chiamante riscrive il cookie).
 *
 * È il punto unico usato da proxy.ts e dai layout delle aree: garantisce che
 * una sessione resti sempre coerente (un cookie "admin" forgiato da un utente
 * non autorizzato viene corretto alla propria area).
 */
export function risolviAreaAttiva(
  email: string,
  ruoli: readonly RuoloUtente[],
  cookieValue: string | null | undefined
): AreaRisolta {
  if (isAreaAttiva(cookieValue)) {
    const area = areaEffettiva(email, ruoli, cookieValue);
    if (area === cookieValue) return { area, correzione: false };
    if (area) return { area, correzione: true };
    return { area: null, correzione: true };
  }
  return { area: areaPerRuoli(email, ruoli), correzione: true };
}
