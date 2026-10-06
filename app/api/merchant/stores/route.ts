import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toSlug } from "@/lib/slug";
import { generaSlugUnivoco } from "@/lib/slug-server";
import { creaNotificaAdmin } from "@/lib/amministratore/notifiche";
import { getProfiloAttivita } from "@/lib/profili-attivita";
import { orariPerProfilo } from "@/lib/orari";

export async function GET() {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const storesResult = await getMerchantStoresForUser(user.id);

  if (storesResult.setupRequired) {
    return apiError("SETUP_REQUIRED", storesResult.errorMessage ?? "Configurazione database non completata.", 503);
  }

  return apiOk({ stores: storesResult.data });
}

export async function POST(request: Request) {
  // Solo la sessione merchant può creare negozi.
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const body = await request.json();
  const nome = (body.nome as string)?.trim();
  const categoria = (body.categoria as string)?.trim();
  const profiloId = typeof body.profiloAttivita === "string" ? body.profiloAttivita.trim() : "ecommerce";
  const profilo = getProfiloAttivita(profiloId) ?? getProfiloAttivita("ecommerce");

  if (!nome) return apiError("VALIDATION_ERROR", "Il nome del negozio è obbligatorio.", 422);
  if (!categoria) return apiError("VALIDATION_ERROR", "La categoria è obbligatoria.", 422);

  const supabase = createAdminSupabaseClient();

  // Un venditore può avere un solo negozio attivo.
  // Il controllo applicativo evita di arrivare al database nella maggior parte dei casi;
  // il trigger DB mantiene comunque la regola anche in caso di richieste concorrenti.
  const { count: existingStoreCount, error: existingStoreError } = await supabase
    .from("negozi")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .is("deleted_at", null);

  if (existingStoreError) {
    console.error("[/api/merchant/stores] Errore verifica negozio esistente:", existingStoreError);
    return apiError("CREATE_FAILED", "Impossibile verificare il negozio esistente. Riprova tra poco.", 500);
  }

  if ((existingStoreCount ?? 0) > 0) {
    return apiError("STORE_ALREADY_EXISTS", "Hai già un negozio registrato. Ogni venditore può registrare un solo negozio.", 409);
  }

  const slugBase = (body.slug as string)?.trim() || toSlug(nome);
  const slug = await generaSlugUnivoco("negozi", slugBase || "negozio");

  const { data, error } = await supabase
    .from("negozi")
    .insert({
      owner_user_id: user.id,
      nome,
      categoria,
      slug,
      citta: (body.citta as string)?.trim() || null,
      logo_url: (body.logo_url as string) || null,
      attivo: true,
      moduli_attivi: profilo?.moduli_attivi ?? null,
      data: profilo
        ? {
            tipo_attivita: profilo.id,
            operativita: profilo.operativita,
          }
        : null,
      orari: profilo ? orariPerProfilo(null, profilo.id) : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[/api/merchant/stores] Errore creazione negozio:", error);

    if (error.code === "23505") {
      return apiError("STORE_ALREADY_EXISTS", "Hai già un negozio registrato. Ogni venditore può registrare un solo negozio.", 409);
    }

    return apiError("CREATE_FAILED", "Impossibile creare il negozio. Riprova tra poco.", 500);
  }

  // Inizializza il catalogo commerciale in modo idempotente.
  const { error: metodiError } = await supabase.rpc("negozio_metodi_inizializza", {
    p_negozio_id: data.id,
  });
  if (metodiError) {
    console.error("[/api/merchant/stores] Errore inizializzazione metodi:", metodiError.message);
  }

  // Notifica admin — BEST-EFFORT, creazione negozio riuscita. Mai
  // bloccante: un errore qui non tocca l'esito della creazione.
  await creaNotificaAdmin({
    tipo: "negozio_creato",
    titolo: "Nuovo negozio creato",
    corpo: nome,
    gravita: "info",
    href: `/amministratore/negozi/${data.id}`,
  });

  return apiOk({ storeId: data.id });
}
