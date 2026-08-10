import type { ComponentType, ReactNode } from "react";
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
import { formattaDataOrdine, etichettaModalita } from "@/lib/cliente/ordini-format";
import type { StatoOrdine } from "@/lib/cliente/types";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { getOrdineVenditore } from "@/lib/merchant/ordini";
import {
  ETICHETTE_STATO,
  etichettaMotivoAnnullamento,
} from "@/lib/merchant/ordini-stati";
import type { OrdineVenditoreDettaglio } from "@/lib/merchant/ordini";

export const dynamic = "force-dynamic";

function formattaPrezzo(value: number): string {
  return `€${(value || 0).toFixed(2).replace(".", ",")}`;
}

function BadgeStato({ stato }: { stato: StatoOrdine }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold";
  const colori: Record<StatoOrdine, string> = {
    in_preparazione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    confermato: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    in_lavorazione: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    pronto: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
    in_consegna: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    consegnato: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    cancellato: "bg-red-50 text-red-600 ring-1 ring-red-200",
  };
  return <span className={`${base} ${colori[stato]}`}>{ETICHETTE_STATO[stato]}</span>;
}

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
        <Icon className="h-4 w-4 text-blue-600" aria-hidden />
        {titolo}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function RigaDettaglio({ etichetta, valore }: { etichetta: string; valore: ReactNode }) {
  if (valore === null || valore === undefined || valore === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-500">{etichetta}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{valore}</span>
    </div>
  );
}

/** Timeline dello storico eventi (più recente in alto). */
function StoricoEventi({ eventi }: { eventi: OrdineVenditoreDettaglio["eventi"] }) {
  const ordinati = [...eventi].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (ordinati.length === 0) {
    return <p className="text-sm text-slate-500">Nessun evento registrato.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {ordinati.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow" />
          <p className="text-sm font-bold text-slate-800">
            {ev.dettaglio ?? ev.evento}
            {ev.evento === "cancellato" && ev.motivo ? (
              <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                {etichettaMotivoAnnullamento(ev.motivo)}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {new Date(ev.createdAt).toLocaleString("it-IT", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {ev.nota && <p className="mt-1 text-xs italic text-slate-500">“{ev.nota}”</p>}
        </li>
      ))}
    </ol>
  );
}

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

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb + intestazione ───────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/merchant/${negozioId}/ordini`} className="transition hover:text-blue-600">
          Ordini
        </Link>
        <span>/</span>
        <span className="font-medium text-slate-700">{ordine.numero}</span>
      </nav>

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
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                  {ordine.numero}
                </h1>
                <BadgeStato stato={ordine.stato} />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {ordine.clienteNome} {ordine.clienteCognome} ·{" "}
                {formattaDataOrdine(ordine.createdAt)} ·{" "}
                {etichettaModalita(ordine.modalita)}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Totale</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formattaPrezzo(ordine.totale)}</p>
          </div>
        </div>

        {/* Azioni stato */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <OrdineAzioni
            negozioId={negozioId}
            ordineId={ordineId}
            numero={ordine.numero}
            stato={ordine.stato}
          />
        </div>
      </div>

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
        <div className="divide-y divide-slate-100">
          {ordine.righe.map((riga) => (
            <div key={riga.prodottoId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 pr-4">
                <p className="truncate text-sm font-semibold text-slate-800">{riga.nomeProdotto}</p>
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
            valore={formattaPrezzo(ordine.righe.reduce((acc, r) => acc + r.prezzoUnitario * r.quantita, 0))}
          />
          {ordine.costoSpedizione > 0 && (
            <RigaDettaglio etichetta="Spedizione" valore={formattaPrezzo(ordine.costoSpedizione)} />
          )}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-slate-900">Totale</span>
            <span className="text-lg font-black text-slate-900">{formattaPrezzo(ordine.totale)}</span>
          </div>
        </div>
      </Sezione>

      {/* ── Consegna ────────────────────────────────────────────────────────── */}
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
                    <CalendarDays className="h-4 w-4 text-blue-600" aria-hidden />
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
                    <Clock className="h-4 w-4 text-blue-600" aria-hidden />
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
                valore={ordine.metodoSpedizione === "express" ? "Espresso (1-2 giorni)" : "Standard (3-5 giorni)"}
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
              <p className="mt-2 text-xs text-slate-500">Note consegna: {ordine.spedizioneNote}</p>
            )}
          </div>
        )}
      </Sezione>

      {/* ── Note cliente ────────────────────────────────────────────────────── */}
      {ordine.note && (
        <Sezione icon={MessageSquareText} titolo="Note del cliente">
          <p className="text-sm leading-6 text-slate-700">{ordine.note}</p>
        </Sezione>
      )}

      {/* ── Annullamento ────────────────────────────────────────────────────── */}
      {ordine.stato === "cancellato" && (
        <Sezione icon={AlertTriangleIcon} titolo="Annullamento">
          <div className="space-y-1.5">
            <RigaDettaglio
              etichetta="Motivo"
              valore={etichettaMotivoAnnullamento(ordine.annullatoMotivo)}
            />
            {ordine.annullatoNota && (
              <RigaDettaglio etichetta="Nota" valore={ordine.annullatoNota} />
            )}
            {ordine.annullatoAt && (
              <RigaDettaglio
                etichetta="Annullato il"
                valore={new Date(ordine.annullatoAt).toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
            )}
          </div>
        </Sezione>
      )}

      {/* ── Storico eventi ──────────────────────────────────────────────────── */}
      <Sezione icon={History} titolo="Storico dell'ordine">
        <StoricoEventi eventi={ordine.eventi} />
      </Sezione>

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
