import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CreditCard,
  MapPin,
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
} from "@/lib/cliente/ordini";
import { getReclamiOrdineCliente } from "@/lib/ordine-reclami";
import type { ReclamoOrdine as ReclamoOrdineType } from "@/lib/ordine-reclami";
import type { OrdineClienteDettaglio, StatoOrdine } from "@/lib/cliente/types";
import ReclamoOrdine from "@/components/cliente/ReclamoOrdine";

type Params = { ordineId: string };

export const metadata = {
  title: "Dettaglio ordine — Area Clienti",
};

export const dynamic = "force-dynamic";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

function BadgeStato({ stato }: { stato: StatoOrdine }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold";
  const colori: Record<StatoOrdine, string> = {
    in_preparazione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    confermato: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    in_lavorazione: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    pronto: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
    in_consegna: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    consegnato: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    cancellato: "bg-red-50 text-red-600 ring-1 ring-red-200",
  };
  return <span className={`${base} ${colori[stato]}`}>{etichettaStato(stato)}</span>;
}

/** Blocco sezione della pagina dettaglio. */
function Sezione({
  icon: Icon,
  titolo,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  titolo: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Icon className="h-4 w-4 text-teal-600" aria-hidden />
        {titolo}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function RigaDettaglio({ etichetta, valore }: { etichetta: string; valore: ReactNode }) {
  if (!valore || valore === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-500">{etichetta}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{valore}</span>
    </div>
  );
}

/**
 * Pagina dettaglio ordine — Area Clienti.
 * VERIFICA DI OWNERSHIP SERVER-SIDE: l'ordine viene letto SOLO se
 * cliente_user_id = utente della sessione E id = ordineId. Un cliente che
 * modifica l'URL con l'UUID di un ordine altrui riceve \"Ordine non trovato\"
 * (nessuna informazione leak).
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

  // Reclami dell'ordine (best-effort: se la tabella non esiste ancora la
  // pagina non deve rompersi).
  let reclami: ReclamoOrdineType[] = [];
  if (ordine) {
    try {
      reclami = await getReclamiOrdineCliente(user.id, ordineId);
    } catch {
      reclami = [];
    }
  }

  // Errore di lettura (distinto dal non-trovato).
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

  // Non trovato OPPURE appartenente a un altro cliente: stessa risposta.
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

  return (
    <div className="space-y-5">
      {/* ── Intestazione ─────────────────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
            <ReceiptText className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Area Clienti
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                {ordine.numero}
              </h1>
              <BadgeStato stato={ordine.stato} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Ordinato il {formattaDataOrdine(ordine.createdAt)}
            </p>
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

      {/* ── Negozio ──────────────────────────────────────────────────────────── */}
      <Sezione icon={Store} titolo="Negozio">
        <p className="text-base font-semibold text-slate-800">{ordine.negozioNome}</p>
      </Sezione>

      {/* ── Prodotti ─────────────────────────────────────────────────────────── */}
      <Sezione icon={Package} titolo="Prodotti">
        <div className="divide-y divide-slate-100">
          {ordine.righe.map((riga) => (
            <div key={riga.prodottoId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 pr-4">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {riga.nomeProdotto}
                </p>
                <p className="text-xs text-slate-500">
                  {riga.quantita} × {formattaPrezzo(riga.prezzoUnitario)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-slate-900">
                {formattaPrezzo(riga.prezzoUnitario * riga.quantita)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
          <RigaDettaglio
            etichetta="Subtotale"
            valore={formattaPrezzo(
              ordine.righe.reduce((acc, r) => acc + r.prezzoUnitario * r.quantita, 0)
            )}
          />
          {ordine.costoSpedizione > 0 && (
            <RigaDettaglio etichetta="Spedizione" valore={formattaPrezzo(ordine.costoSpedizione)} />
          )}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-slate-900">Totale</span>
            <span className="text-lg font-black text-slate-900">
              {formattaPrezzo(ordine.totale)}
            </span>
          </div>
        </div>
      </Sezione>

      {/* ── Consegna ─────────────────────────────────────────────────────────── */}
      <Sezione
        icon={èRitiro ? MapPin : Truck}
        titolo={èRitiro ? "Ritiro in negozio" : "Spedizione a domicilio"}
      >
        {èRitiro ? (
          <>
            <p className="text-sm text-slate-600">
              Ritira il tuo ordine presso {ordine.negozioNome}.
            </p>
            <div className="mt-3 space-y-1.5">
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
          </>
        ) : (
          <>
            {indirizzoSpedizione ? (
              <p className="text-sm leading-6 text-slate-700">{indirizzoSpedizione}</p>
            ) : (
              <p className="text-sm text-slate-600">Indirizzo di spedizione non indicato.</p>
            )}
            <div className="mt-3 space-y-1.5">
              {ordine.metodoSpedizione && (
                <RigaDettaglio
                  etichetta="Metodo spedizione"
                  valore={
                    ordine.metodoSpedizione === "express" ? "Espresso (1-2 giorni)" : "Standard (3-5 giorni)"
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
            </div>
          </>
        )}
        {ordine.spedizioneNote && (
          <p className="mt-3 text-xs text-slate-500">
            Note consegna: {ordine.spedizioneNote}
          </p>
        )}
      </Sezione>

      {/* ── Note e contatti ──────────────────────────────────────────────────── */}
      {(ordine.note || ordine.telefono || ordine.email) && (
        <Sezione icon={ReceiptText} titolo="Dettagli">
          <div className="space-y-1.5">
            {ordine.note && <RigaDettaglio etichetta="Note" valore={ordine.note} />}
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
          </div>
        </Sezione>
      )}

      {/* ── Reclamo: ordine non arrivato (il componente decide visibilità) ──── */}
      <ReclamoOrdine
        ordineId={ordineId}
        puòReclamare={ordine.stato !== "cancellato"}
        reclamiIniziali={reclami}
      />

      {/* ── Azioni ───────────────────────────────────────────────────────────── */}
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
