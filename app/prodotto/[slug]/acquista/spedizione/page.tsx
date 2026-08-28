import { permanentRedirect } from "next/navigation";
import Link from "next/link";
import { risolviProdottoPubblico } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { richiediVariantePerProdotto } from "@/lib/varianti-pubbliche";
import { getMetodiPagamentoPubblici } from "@/lib/pagamenti/metodi-pubblici";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuestMode } from "@/lib/auth/guest";
import { getProfilo } from "@/lib/cliente/profile";
import SpedizioneForm from "@/components/acquista/SpedizioneForm";

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Pre-fill sicuro del checkout buy-now: il profilo viene letto SOLO
 * server-side dall'utente autenticato (mai da un id passato dal browser),
 * così il form riparte precompilato con i dati del cliente. Se l'utente non è
 * autenticato o non ha un profilo, PRE_FILL resta vuoto e il checkout si
 * comporta come oggi.
 */
function PRE_FILL_VUOTO() {
  return {
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    indirizzo: "",
    cap: "",
    citta: "",
    provincia: "",
    autenticato: false,
  };
}

export default async function SpedizionePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const varianteIdRaw = sp.varianteId;
  const varianteId =
    typeof varianteIdRaw === "string" && varianteIdRaw.trim()
      ? varianteIdRaw.trim()
      : null;

  const { prodotto, slugLegacy } = await risolviProdottoPubblico(slug);
  if (slugLegacy) permanentRedirect(`${slugLegacy}/acquista/spedizione`);
  if (!prodotto) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-600">Prodotto non trovato.</p>
      </div>
    );
  }

  const id = prodotto.id as string;
  const slugProdotto = (prodotto.slug as string) ?? id;
  const prezzo = Number("prezzo" in prodotto ? prodotto.prezzo : 0);
  const nome = "nome" in prodotto ? (prodotto.nome as string) : "Prodotto";

  // FASE E4 — varianti: varianteId obbligatorio e validato server-side per i
  // prodotti con varianti; legacy → nessun vincolo.
  const esitoVariante = await richiediVariantePerProdotto(id, varianteId);
  const varianteValida =
    esitoVariante.stato === "valida" ||
    esitoVariante.stato === "non_necessaria";

  if (!varianteValida) {
    return (
      <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-yellow-800">
          Seleziona una variante del prodotto per continuare l&apos;acquisto.
        </p>
        <Link
          href={`/prodotto/${slugProdotto}`}
          className="mt-4 inline-block rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300"
        >
          Torna al prodotto
        </Link>
      </div>
    );
  }

  const varianteIdProp =
    esitoVariante.stato === "valida" ? esitoVariante.variante.id : null;

  const imageUrl = getProdottoImmagine({
    immagine_principale: "immagine_principale" in prodotto
      ? (prodotto.immagine_principale as string | null)
      : null,
    categoria: "categoria" in prodotto
      ? (prodotto.categoria as string | null)
      : null,
  });

  // ── BLOCCO: utente anonimo SENZA modalità guest esplicita ─────────────────
  const utente = await getCurrentUser();
  const guestMode = await getGuestMode();
  if (!utente && !guestMode) {
    permanentRedirect("/login?area=cliente");
  }

  // FASE F1 — metodi di pagamento REALMENTE disponibili per questo negozio
  // (carta solo se Stripe è configurato; bonifico solo se configurato).
  const esitoMetodi = await getMetodiPagamentoPubblici(String(prodotto.negozio_id));
  const metodiPagamento = esitoMetodi.ok ? esitoMetodi.metodi : [];

  // PROFILE PREFILL — server-side, solo utente autenticato.
  let prefill = PRE_FILL_VUOTO();
  if (utente) {
    const profilo = await getProfilo(utente.id).catch(() => null);
    prefill = {
      nome: profilo?.nome ?? "",
      cognome: profilo?.cognome ?? "",
      email: utente.email ?? "",
      telefono: profilo?.telefono ?? "",
      indirizzo: profilo?.indirizzo ?? "",
      cap: profilo?.cap ?? "",
      citta: profilo?.citta ?? "",
      provincia: profilo?.provincia ?? "",
      autenticato: true,
    };
  }

  return (
    <SpedizioneForm
      prodottoId={id}
      nome={nome}
      prezzo={prezzo}
      imageUrl={imageUrl}
      varianteId={varianteIdProp}
      metodiPagamento={metodiPagamento}
      prefill={prefill}
    />
  );
}