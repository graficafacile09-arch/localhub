/**
 * "AVVISAMI QUANDO TORNA DISPONIBILE" — servizio server-side.
 *
 * Gestisce l'intero ciclo di vita dell'avviso di disponibilità:
 *   1. iscrizione (autenticato o guest con email) con anti-duplicati;
 *   2. verifica dello stato di iscrizione (per la UI);
 *   3. conteggio degli interessati attivi (dashboard venditore);
 *   4. notifica quando lo stock passa da 0 a > 0: claim atomico delle
 *      richieste active, invio email, marcatura notified (o rollback ad
 *      active in caso di errore, senza perdere la richiesta).
 *
 * Tutte le query usano il client ADMIN (server-only). Nessuna credenziale è
 * mai esposta al browser.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { inviaEmailProdottoDisponibile } from "@/lib/cliente/avvisami-email";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client admin con fallback sicuro (mai eccezioni fuori da qui). */
function getDb() {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

export function isEmailValida(raw: string): boolean {
  return raw.length <= 254 && EMAIL_RE.test(raw);
}

export type EsitoIscrizione =
  | { ok: true; giaIscritto: boolean }
  | { ok: false; errore: string; status: number };

type ProdottoAvviso = {
  id: string;
  negozioId: string;
  nome: string;
  slug: string;
};

async function getProdottoAvviso(prodottoId: string): Promise<ProdottoAvviso | null> {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("prodotti")
    .select("id, negozio_id, nome, slug")
    .eq("id", Number(prodottoId))
    .single();

  if (error || !data) return null;

  return {
    id: String(data.id),
    negozioId: String(data.negozio_id),
    nome: String(data.nome ?? "Prodotto"),
    slug: String(data.slug ?? ""),
  };
}

/**
 * Iscrive il cliente all'avviso (o restituisce che è già iscritto).
 * - email SEMPRE normalizzata in minuscolo e validata;
 * - prodotto verificato sul DB (mai fidarsi del solo id del client);
 * - anti-duplicati: l'indice unico parziale su (prodotto_id, email) WHERE
 *   stato='active' + la gestione dell'errore 23505 coprono anche le race.
 */
export async function iscrizioneAvviso(opts: {
  prodottoId: string;
  userId: string | null;
  email: string;
}): Promise<EsitoIscrizione> {
  const email = opts.email.trim().toLowerCase();
  if (!isEmailValida(email)) {
    return { ok: false, errore: "Inserisci un indirizzo email valido.", status: 422 };
  }

  const prodotto = await getProdottoAvviso(opts.prodottoId);
  if (!prodotto) {
    return { ok: false, errore: "Prodotto non trovato.", status: 404 };
  }

  const db = getDb();
  if (!db) {
    return { ok: false, errore: "Database non disponibile.", status: 500 };
  }

  const { data: esistenti } = await db
    .from("product_stock_notifications")
    .select("id")
    .eq("prodotto_id", Number(opts.prodottoId))
    .eq("email", email)
    .eq("stato", "active")
    .limit(1);

  if (esistenti && esistenti.length > 0) {
    return { ok: true, giaIscritto: true };
  }

  const { error } = await db.from("product_stock_notifications").insert({
    prodotto_id: Number(opts.prodottoId),
    negozio_id: prodotto.negozioId,
    user_id: opts.userId,
    email,
    stato: "active",
  });

  if (error) {
    // 23505 → un altro inserimento active è arrivato nel frattempo.
    if (error.code === "23505") {
      return { ok: true, giaIscritto: true };
    }
    console.error("[avvisami] inserimento fallito:", error.message);
    return { ok: false, errore: "Impossibile registrare l'avviso. Riprova.", status: 500 };
  }

  return { ok: true, giaIscritto: false };
}

/**
 * True se esiste una richiesta ATTIVA per questo prodotto + email/user.
 * Usato dalla UI per mostrare lo stato "già iscritto" senza rifare il POST.
 */
export async function statoAvviso(
  prodottoId: string,
  email: string | null,
  userId: string | null
): Promise<boolean> {
  if (!email && !userId) return false;

  const db = getDb();
  if (!db) return false;

  let query = db
    .from("product_stock_notifications")
    .select("id")
    .eq("prodotto_id", Number(prodottoId))
    .eq("stato", "active")
    .limit(1);

  if (email) {
    query = query.eq("email", email.trim().toLowerCase());
  } else if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query;
  return Boolean(data && data.length > 0);
}

/** Numero di interessati ATTIVI per un prodotto (dashboard venditore). */
export async function contaInteressati(prodottoId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const { count, error } = await db
    .from("product_stock_notifications")
    .select("id", { count: "exact", head: true })
    .eq("prodotto_id", Number(prodottoId))
    .eq("stato", "active");

  if (error) return 0;
  return count ?? 0;
}

/**
 * Processa il ritorno di disponibilità di un prodotto: invia l'email a tutti
 * gli interessati ATTIVI e li marca notified. Il claim è atomico (UPDATE ...
 * WHERE stato='active' RETURNING) → ogni riga viene reclamata da UN solo
 * processo, quindi nessun invio duplicato. In caso di errore di invio la riga
 * viene riportata ad active (mai persa, ritentata al prossimo ciclo).
 */
export async function processaRitornoDisponibilita(
  prodottoId: string
): Promise<{ inviati: number; falliti: number }> {
  const prodotto = await getProdottoAvviso(prodottoId);
  if (!prodotto) return { inviati: 0, falliti: 0 };

  const db = getDb();
  if (!db) return { inviati: 0, falliti: 0 };

  const { data: reclamati, error } = await db
    .from("product_stock_notifications")
    .update({ stato: "notified", notified_at: new Date().toISOString() })
    .eq("prodotto_id", Number(prodottoId))
    .eq("stato", "active")
    .select("id, email");

  if (error || !reclamati) {
    console.error("[avvisami] claim fallito:", error?.message);
    return { inviati: 0, falliti: 0 };
  }

  const prodottoUrl = `${SITE_URL}/prodotto/${prodotto.slug || prodotto.id}`;
  let inviati = 0;
  let falliti = 0;

  for (const riga of reclamati as { id: string; email: string }[]) {
    const esito = await inviaEmailProdottoDisponibile({
      to: riga.email,
      prodottoNome: prodotto.nome,
      prodottoUrl,
    });

    if (esito.stato === "sent") {
      inviati += 1;
    } else {
      falliti += 1;
      // L'invio NON è riuscito: riporta ad active così la richiesta non
      // viene persa e verrà ritentata al prossimo ritorno di disponibilità.
      await db
        .from("product_stock_notifications")
        .update({ stato: "active", notified_at: null })
        .eq("id", riga.id)
        .eq("stato", "notified");
    }
  }

  return { inviati, falliti };
}

/**
 * Rileva la transizione 0 → >0 e, se avvenuta, genera la notifica.
 * Chiamata dai punti autoritativi in cui lo stock viene modificato dal
 * venditore (API prodotti). `oldQuantita`/`newQuantita` possono essere null
 * (quantità non tracciata): in quel caso nessuna notifica.
 */
export async function notificaSeTornatoDisponibile(
  prodottoId: string,
  oldQuantita: number | null | undefined,
  newQuantita: number | null | undefined
): Promise<void> {
  const oldEsaurito = oldQuantita != null && oldQuantita <= 0;
  const newDisponibile = newQuantita != null && newQuantita > 0;

  if (oldEsaurito && newDisponibile) {
    await processaRitornoDisponibilita(prodottoId).catch((e) => {
      console.error("[avvisami] notifica fallita:", e);
    });
  }
}
