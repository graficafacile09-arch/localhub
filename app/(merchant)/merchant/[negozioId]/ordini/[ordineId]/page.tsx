import Link from "next/link";
import {
  AlertTriangle as AlertTriangleIcon,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Clock,
  CreditCard,
  History,
  Mail,
  MapPin,
  MessageSquareText,
  Package,
  Phone,
  ReceiptText,
  Store,
  Truck,
  User,
} from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import OrdineAzioni from "@/components/merchant/OrdineAzioni";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  configStatoOrdine,
  etichettaModalita,
  etichettaStato,
  formattaDataOrdine,
  sintesiProdotti,
} from "@/lib/cliente/ordini-format";
import type { StatoOrdine } from "@/lib/cliente/types";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdineVenditore } from "@/lib/merchant/ordini";
import { getReclamiVenditore } from "@/lib/ordine-reclami";
import type { ReclamoOrdine as ReclamoOrdineType } from "@/lib/ordine-reclami";
import ReclamiOrdine from "@/components/merchant/ReclamiOrdine";
import type { OrdineVenditoreDettaglio } from "@/lib/merchant/ordini";
import { Sezione, RigaDettaglio } from "@/components/ordini/Sezione";
import { StatoOrdineBanner } from "@/components/ordini/StatoOrdineBanner";
import { RigheProdotto } from "@/components/ordini/RigheProdotto";
import { StoricoEventi } from "@/components/ordini/StoricoEventi";

export const dynamic = "force-dynamic";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/** Badge compatto di stato (stesso linguaggio visivo del banner). */
function BadgeStato({ stato }: { stato: StatoOrdine }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold";
  const colori: Record<StatoOrdine, string> = {
    in_preparazione: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    confermato: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    in_lavorazione: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    pronto: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    in_consegna: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    consegnato: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
    cancellato: "bg-red-50 text-red-700 ring-1 ring-red-200",
  };
  return <span className={`${base} ${colori[stato]}`}>{etichettaStato(stato)}</span>;
}

/**
 * Pagina dettaglio ordine — Area Venditore ("scheda ordine").
 * Stesso linguaggio visivo dell'area cliente (banner di stato guidato dal
 * DB, identificazione #LH-XXXX · prodotto, sezioni condivise) con in più
 * gli strumenti di gestione: azioni di stato (OrdineAzioni), dati cliente
 * e gestione reclami. Un ordine ANNULLATO mostra sempre la grafica di
 * annullamento con motivo/nota. OWNERSHIP server-side: canManageStore +
 * filtro negozio_id (ordine altrui → non trovato).
 */
export default async function MerchantOrdineDettaglioPage({
  params,
}: {
  params: Promise<{ negozioId: string; ordineId: string }>;
}) {
  const { negozioId, ordineId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area amministratore."}
      />
    );
  }
  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso agli ordini di questo negozio."
      />
    );
  }

  let ordine: OrdineVenditoreDettaglio | null = null;
  let errore: string | null = null;
  try {
    ordine = await getOrdineVenditore(user.id, negozioId, ordineId);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
  }

  let reclami: ReclamoOrdineType[] = [];
  if (ordine) {
    try {
      reclami = await getReclamiVenditore(user.id, negozioId, ordineId);
    } catch {
      reclami = [];
    }
  }

  if (errore) {
    return (
      <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-slate-900">Impossibile caricare l&apos;ordine</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Si è verificato un errore durante il recupero del dettaglio. Riprova tra qualche istante.
        </p>
        <Link
          href={`/merchant/${negozioId}/ordini`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
        </Link>
      </div>
    );
  }

  if (!ordine) {
    return (
      <MerchantEmptyState
        title="Ordine non trovato"
        description="Questo ordine non esiste oppure non appartiene a questo negozio."
        action={
          <Link
            href={`/merchant/${negozioId}/ordini`}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
          </Link>
        }
      />
    );
  }

  const èRitiro = ordine.modalita === "ritiro";
  const indirizzoSpedizione = [
    ordine.spedizioneIndirizzo,
    ordine.spedizioneCap,
    ordine.spedizioneCitta,
    ordine.spedizioneProvincia,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(", ");

  const sintesi = sintesiProdotti(ordine.righe);
  const banner = configStatoOrdine(ordine.stato);

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/merchant/${negozioId}/ordini`} className="transition hover:text-blue-600">
          Ordini
        </Link>
        <span>/</span>
        <span className="font-medium text-slate-700">{ordine.numero}</span>
      </nav>

      {/* ── Header ordine: numero + prodotto, MAI l'UUID ────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ReceiptText className="h-7 w-7" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Dettaglio ordine
              </p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                <span className="whitespace-nowrap">{ordine.numero}</span>
                {sintesi ? (
                  <span className="ml-2 font-bold text-slate-500">· {sintesi}</span>
                ) : null}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-4 w-4 text-slate-400" aria-hidden />
                  <strong className="text-slate-800">
                    {ordine.clienteNome} {ordine.clienteCognome}
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span>{formattaDataOrdine(ordine.createdAt)}</span>
                <span className="text-slate-300">•</span>
                <span>{etichettaModalita(ordine.modalita)}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <BadgeStato stato={ordine.stato} />
                <span className="text-xs text-slate-400">Negozio: {ordine.negozioNome}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Totale</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formattaPrezzo(ordine.totale)}</p>
          </div>
        </div>
      </div>

      {/* ── Stato ordine (grafica guidata dal DB) ───────────────────────────── */}
      <StatoOrdineBanner
        stato={ordine.stato}
        annullatoMotivo={ordine.annullatoMotivo}
        annullatoNota={ordine.annullatoNota}
        annullatoAt={ordine.annullatoAt}
        sottoTitolo={
          ordine.stato === "cancellato"
            ? "Ordine terminale: lo stock è stato ripristinato (se tracciato) e il cliente è stato avvisato via email."
            : undefined
        }
      />

      {/* ── Azioni venditore (in base allo stato reale) ─────────────────────── */}
      {!banner.terminale && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
          <OrdineAzioni
            negozioId={negozioId}
            ordineId={ordineId}
            numero={ordine.numero}
            stato={ordine.stato}
          />
        </div>
      )}

      {/* ── Cliente ─────────────────────────────────────────────────────────── */}
      <Sezione icon={User} titolo="Cliente">
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-slate-800">
            {ordine.clienteNome} {ordine.clienteCognome}
          </p>
          {ordine.clienteTelefono && (
            <RigaDettaglio
              etichetta="Telefono"
              valore={
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-slate-400" aria-hidden />
                  {ordine.clienteTelefono}
                </span>
              }
            />
          )}
          {ordine.clienteEmail && (
            <RigaDettaglio
              etichetta="Email"
              valore={
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-slate-400" aria-hidden />
                  {ordine.clienteEmail}
                </span>
              }
            />
          )}
        </div>
      </Sezione>

      {/* ── Prodotti ────────────────────────────────────────────────────────── */}
      <Sezione icon={Package} titolo="Prodotti">
        <RigheProdotto
          righe={ordine.righe}
          costoSpedizione={ordine.costoSpedizione}
          totale={ordine.totale}
        />
      </Sezione>

      {/* ── Consegna / Ritiro ───────────────────────────────────────────────── */}
      <Sezione
        icon={èRitiro ? MapPin : Truck}
        titolo={èRitiro ? "Ritiro in negozio" : "Spedizione a domicilio"}
      >
        {èRitiro ? (
          <div className="space-y-1.5">
            <RigaDettaglio
              etichetta="Data ritiro"
              valore={
                ordine.ritiroData ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
                    {ordine.ritiroData}
                  </span>
                ) : (
                  "Da definire con il cliente"
                )
              }
            />
            {ordine.ritiroFascia && (
              <RigaDettaglio
                etichetta="Fascia oraria"
                valore={
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-500" aria-hidden />
                    {ordine.ritiroFascia}
                  </span>
                }
              />
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {indirizzoSpedizione ? (
              <p className="text-sm leading-6 text-slate-700">{indirizzoSpedizione}</p>
            ) : (
              <p className="text-sm text-slate-600">Indirizzo di spedizione non indicato.</p>
            )}
            {ordine.metodoSpedizione && (
              <RigaDettaglio
                etichetta="Metodo spedizione"
                valore={
                  ordine.metodoSpedizione === "express"
                    ? "Espresso (1-2 giorni)"
                    : "Standard (3-5 giorni)"
                }
              />
            )}
            {ordine.metodoPagamento && (
              <RigaDettaglio
                etichetta="Metodo pagamento"
                valore={
                  <span className="inline-flex items-center gap-1.5">
                    {ordine.metodoPagamento === "bonifico" ? (
                      <Banknote className="h-4 w-4 text-slate-400" aria-hidden />
                    ) : (
                      <CreditCard className="h-4 w-4 text-slate-400" aria-hidden />
                    )}
                    {ordine.metodoPagamento === "carta"
                      ? "Carta"
                      : ordine.metodoPagamento === "paypal"
                        ? "PayPal"
                        : "Bonifico bancario"}
                  </span>
                }
              />
            )}
            {ordine.spedizioneNote && (
              <p className="pt-1 text-xs text-slate-500">Note consegna: {ordine.spedizioneNote}</p>
            )}
          </div>
        )}
      </Sezione>

      {/* ── Note cliente (solo se presenti) ─────────────────────────────────── */}
      {ordine.note && (
        <Sezione icon={MessageSquareText} titolo="Note del cliente">
          <p className="text-sm leading-6 text-slate-700">{ordine.note}</p>
        </Sezione>
      )}

      {/* ── Cronologia (dati reali da ordini_eventi) ────────────────────────── */}
      <Sezione icon={History} titolo="Cronologia dell'ordine">
        <StoricoEventi eventi={ordine.eventi} />
      </Sezione>

      {/* ── Reclami del cliente ─────────────────────────────────────────────── */}
      {reclami.length > 0 && (
        <Sezione icon={AlertTriangleIcon} titolo="Reclami del cliente">
          <ReclamiOrdine
            negozioId={negozioId}
            ordineId={ordineId}
            reclamiIniziali={reclami}
          />
        </Sezione>
      )}

      {/* ── Ritorno ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/merchant/${negozioId}/ordini`}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna agli ordini
        </Link>
        <Link
          href={`/merchant/${negozioId}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
        >
          <Store className="h-4 w-4" aria-hidden /> Dashboard negozio
        </Link>
      </div>
    </div>
  );
}
