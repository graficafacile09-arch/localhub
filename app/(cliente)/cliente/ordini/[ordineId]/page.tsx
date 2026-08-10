import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CreditCard,
  History,
  MapPin,
  MessageSquareText,
  Package,
  Phone,
  ReceiptText,
  Store,
  Truck,
} from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  etichettaModalita,
  etichettaStato,
  formattaDataOrdine,
  getOrdineCliente,
  sintesiProdotti,
} from "@/lib/cliente/ordini";
import { getReclamiOrdineCliente } from "@/lib/ordine-reclami";
import type { ReclamoOrdine as ReclamoOrdineType } from "@/lib/ordine-reclami";
import type { OrdineClienteDettaglio, StatoOrdine } from "@/lib/cliente/types";
import ReclamoOrdine from "@/components/cliente/ReclamoOrdine";
import { Sezione, RigaDettaglio } from "@/components/ordini/Sezione";
import { StatoOrdineBanner } from "@/components/ordini/StatoOrdineBanner";
import { RigheProdotto } from "@/components/ordini/RigheProdotto";
import { StoricoEventi } from "@/components/ordini/StoricoEventi";

type Params = { ordineId: string };

export const metadata = {
  title: "Dettaglio ordine — Area Clienti",
};

export const dynamic = "force-dynamic";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

/** Badge compatto di stato (header e liste). Stesso linguaggio del banner. */
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
 * Pagina dettaglio ordine — Area Clienti ("scheda ordine").
 * LO STATO DEL DB COMANDA LA GRAFICA: il banner (StatoOrdineBanner) è
 * derivato da ordine.stato e un ordine ANNULLATO mostra sempre e solo la
 * grafica di annullamento con motivo/nota. L'identificativo principale è
 * il numero leggibile (LH-XXXX) con la sintesi dei prodotti, MAI l'UUID.
 * OWNERSHIP server-side: ordine restituito solo se cliente_user_id =
 * utente della sessione.
 */
export default async function OrdineDettaglioPage({ params }: { params: Promise<Params> }) {
  const { ordineId } = await params;
  const user = await requireCurrentUser("/login?area=cliente");

  let ordine: OrdineClienteDettaglio | null = null;
  let errore: string | null = null;
  try {
    ordine = await getOrdineCliente(user.id, ordineId);
  } catch (err) {
    errore = err instanceof Error ? err.message : "Errore sconosciuto";
  }

  let reclami: ReclamoOrdineType[] = [];
  if (ordine) {
    try {
      reclami = await getReclamiOrdineCliente(user.id, ordineId);
    } catch {
      reclami = [];
    }
  }

  if (errore) {
    return (
      <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-slate-900">
          Impossibile caricare l&apos;ordine
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Si è verificato un errore durante il recupero del dettaglio. Riprova
          tra qualche istante.
        </p>
        <Link
          href="/cliente/ordini"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna ai miei ordini
        </Link>
      </div>
    );
  }

  if (!ordine) {
    return (
      <div className="rounded-[2rem] border border-white/70 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <Package className="h-8 w-8 text-slate-400" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-black tracking-tight text-slate-900">
          Ordine non trovato
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Questo ordine non esiste o non appartiene al tuo account.
        </p>
        <Link
          href="/cliente/ordini"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna ai miei ordini
        </Link>
      </div>
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

  return (
    <div className="space-y-5">
      {/* ── Header ordine: numero + prodotto, MAI l'UUID ─────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
            <ReceiptText className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Area Clienti
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              <span className="whitespace-nowrap">{ordine.numero}</span>
              {sintesi ? (
                <span className="ml-2 font-bold text-slate-500">· {sintesi}</span>
              ) : null}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span>Ordine presso <strong className="text-slate-800">{ordine.negozioNome}</strong></span>
              <span className="text-slate-300">•</span>
              <span>del {formattaDataOrdine(ordine.createdAt)}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <BadgeStato stato={ordine.stato} />
              <span className="text-xs text-slate-400">
                {etichettaModalita(ordine.modalita)}
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Totale
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {formattaPrezzo(ordine.totale)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Stato ordine (grafica guidata dal DB) ───────────────────────────── */}
      <StatoOrdineBanner
        stato={ordine.stato}
        annullatoMotivo={ordine.annullatoMotivo}
        annullatoNota={ordine.annullatoNota}
        annullatoAt={ordine.annullatoAt}
      />

      {/* ── Prodotti ────────────────────────────────────────────────────────── */}
      <Sezione icon={Package} titolo="Prodotti">
        <RigheProdotto
          righe={ordine.righe}
          costoSpedizione={ordine.costoSpedizione}
          totale={ordine.totale}
        />
      </Sezione>

      {/* ── Negozio ─────────────────────────────────────────────────────────── */}
      <Sezione
        icon={Store}
        titolo="Negozio"
        action={
          <Link
            href={`/negozi?q=${encodeURIComponent(ordine.negozioNome)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-teal-300 hover:text-teal-700"
          >
            Visita il negozio
          </Link>
        }
      >
        <p className="text-base font-semibold text-slate-800">{ordine.negozioNome}</p>
      </Sezione>

      {/* ── Consegna / Ritiro ───────────────────────────────────────────────── */}
      <Sezione
        icon={èRitiro ? MapPin : Truck}
        titolo={èRitiro ? "Ritiro in negozio" : "Spedizione a domicilio"}
      >
        {èRitiro ? (
          <div className="space-y-1.5">
            <p className="text-sm text-slate-600">
              Ritira il tuo ordine presso {ordine.negozioNome}.
            </p>
            <RigaDettaglio
              etichetta="Data ritiro"
              valore={
                ordine.ritiroData ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-teal-600" aria-hidden />
                    {ordine.ritiroData}
                  </span>
                ) : (
                  "Da definire con il negozio"
                )
              }
            />
            {ordine.ritiroFascia && (
              <RigaDettaglio etichetta="Fascia oraria" valore={ordine.ritiroFascia} />
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
              <p className="pt-1 text-xs text-slate-500">
                Note consegna: {ordine.spedizioneNote}
              </p>
            )}
          </div>
        )}
      </Sezione>

      {/* ── Note cliente (solo se presenti) ─────────────────────────────────── */}
      {ordine.note && (
        <Sezione icon={MessageSquareText} titolo="Note">
          <p className="text-sm leading-6 text-slate-700">{ordine.note}</p>
        </Sezione>
      )}

      {/* ── Contatti ────────────────────────────────────────────────────────── */}
      {(ordine.telefono || ordine.email) && (
        <Sezione icon={Phone} titolo="Contatti">
          <div className="space-y-1.5">
            {ordine.telefono && (
              <RigaDettaglio
                etichetta="Telefono"
                valore={
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-slate-400" aria-hidden />
                    {ordine.telefono}
                  </span>
                }
              />
            )}
            {ordine.email && (
              <RigaDettaglio
                etichetta="Email"
                valore={
                  <span className="inline-flex items-center gap-1.5">
                    <ReceiptText className="h-4 w-4 text-slate-400" aria-hidden />
                    {ordine.email}
                  </span>
                }
              />
            )}
          </div>
        </Sezione>
      )}

      {/* ── Cronologia (dati reali da ordini_eventi) ────────────────────────── */}
      {ordine.eventi.length > 0 && (
        <Sezione icon={History} titolo="Cronologia dell'ordine">
          <StoricoEventi eventi={ordine.eventi} />
        </Sezione>
      )}

      {/* ── Reclamo: ordine non arrivato (il componente decide la visibilità) ── */}
      <ReclamoOrdine
        ordineId={ordineId}
        puòReclamare={ordine.stato !== "cancellato"}
        reclamiIniziali={reclami}
      />

      {/* ── Azioni ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/cliente/ordini"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna ai miei ordini
        </Link>
        <Link
          href={`/negozi?q=${encodeURIComponent(ordine.negozioNome)}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
        >
          Visita il negozio
        </Link>
      </div>
    </div>
  );
}
