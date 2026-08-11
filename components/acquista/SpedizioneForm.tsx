"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Package, Truck, CreditCard, Building, Banknote, Loader2 } from "lucide-react";
import QuantitySelector from "./QuantitySelector";
import { creaOrdineViaApi, nuovaChiaveIdempotenza } from "@/lib/cliente/ordini-client";

export default function SpedizioneForm({
  nome,
  prezzo,
  imageUrl,
  prodottoId,
  varianteId,
}: {
  nome: string;
  prezzo: number;
  imageUrl: string;
  prodottoId: string;
  /** Variante selezionata (FASE E4): solo trasportata, validata dal server. */
  varianteId?: string | null;
}) {
  const router = useRouter();
  const [quantita, setQuantita] = useState(1);
  const [metodoSpedizione, setMetodoSpedizione] = useState<"standard" | "express">("standard");
  const [metodoPagamento, setMetodoPagamento] = useState<"carta" | "paypal" | "bonifico">("carta");
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Chiave di idempotenza: generata UNA volta per pagina → un doppio click
  // (o retry) non crea mai due ordini.
  const chiaveIdempotenza = useRef<string>(nuovaChiaveIdempotenza());

  const costoSpedizione = metodoSpedizione === "express" ? 12.9 : 5.9;
  const subtotal = prezzo * quantita;
  const totale = subtotal + costoSpedizione;

  const procediAlPagamento = async () => {
    if (inviando) return; // anti doppio invio
    const form = formRef.current;
    if (!form) return;

    // Legge i campi del modulo (FormField sono input uncontrolled con id).
    const dati = new FormData(form);
    const val = (chiave: string) => String(dati.get(chiave) ?? "").trim();

    if (!val("nome") || !val("cognome")) {
      setErrore("Inserisci nome e cognome.");
      return;
    }
    if (!val("indirizzo") || !val("cap") || !val("citta") || !val("provincia")) {
      setErrore("Completa l'indirizzo di spedizione.");
      return;
    }

    setInviando(true);
    setErrore(null);
    try {
      const esito = await creaOrdineViaApi({
        idempotencyKey: chiaveIdempotenza.current,
        prodottoId,
        varianteId: varianteId ?? null,
        quantita,
        modalita: "spedizione",
        cliente: {
          nome: val("nome"),
          cognome: val("cognome"),
          telefono: val("telefono") || null,
          email: val("email") || null,
        },
        spedizione: {
          indirizzo: val("indirizzo"),
          cap: val("cap"),
          citta: val("citta"),
          provincia: val("provincia"),
          note: val("note") || null,
          metodoSpedizione,
          metodoPagamento,
        },
      });

      if (!esito.ok) {
        setErrore(esito.errore);
        setInviando(false);
        return;
      }

      // Chiusura Assistente AI + navigazione alla conferma ordine.
      window.dispatchEvent(new Event("assistant:close"));
      router.push(`/ordini/conferma/${esito.ordineId}`);
    } catch {
      setErrore("Si è verificato un errore. Riprova.");
      setInviando(false);
    }
  };

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {/* Colonna sinistra: prodotto */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl">
          <div className="relative aspect-square max-h-[300px] overflow-hidden bg-slate-100">
            <div
              role="img"
              aria-label={nome}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-900">{nome}</h2>
          <p className="text-2xl font-black text-emerald-700">
            €{prezzo.toFixed(2)}
          </p>
        </div>

        {/* Quantità */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Quantità</h3>
          <div className="mt-3">
            <QuantitySelector value={quantita} onChange={setQuantita} />
          </div>
        </div>
      </div>

      {/* Colonna destra: form */}
      <form ref={formRef} className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        {/* Indirizzo di spedizione */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <Truck className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Indirizzo di spedizione
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <FormField label="Nome" id="nome" required />
            <FormField label="Cognome" id="cognome" required />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <FormField label="Telefono" id="telefono" type="tel" required />
            <FormField label="Email" id="email" type="email" required />
          </div>
          <div className="mt-3">
            <FormField label="Indirizzo" id="indirizzo" required />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <FormField label="CAP" id="cap" required />
            <FormField label="Città" id="citta" required />
            <FormField label="Provincia" id="provincia" required />
          </div>
          <div className="mt-3">
            <FormField label="Note consegna" id="note" />
          </div>
        </div>

        {/* Metodo spedizione */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <Package className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Metodo spedizione
          </h3>
          <div className="mt-3 space-y-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                metodoSpedizione === "standard"
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="spedizione"
                value="standard"
                checked={metodoSpedizione === "standard"}
                onChange={() => setMetodoSpedizione("standard")}
                className="h-4 w-4 accent-blue-600"
              />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Standard</p>
                  <p className="text-[11px] text-slate-500">Consegna in 3-5 giorni lavorativi</p>
                </div>
                <span className="text-sm font-bold text-slate-900">€5,90</span>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                metodoSpedizione === "express"
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="spedizione"
                value="express"
                checked={metodoSpedizione === "express"}
                onChange={() => setMetodoSpedizione("express")}
                className="h-4 w-4 accent-blue-600"
              />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Express</p>
                  <p className="text-[11px] text-slate-500">Consegna in 1-2 giorni lavorativi</p>
                </div>
                <span className="text-sm font-bold text-slate-900">€12,90</span>
              </div>
            </label>
          </div>
        </div>

        {/* Metodo pagamento */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <CreditCard className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Metodo pagamento
          </h3>
          <div className="mt-3 space-y-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                metodoPagamento === "carta"
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="pagamento"
                value="carta"
                checked={metodoPagamento === "carta"}
                onChange={() => setMetodoPagamento("carta")}
                className="h-4 w-4 accent-blue-600"
              />
              <div className="flex flex-1 items-center gap-2">
                <CreditCard className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-900">Carta di credito/debito</span>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                metodoPagamento === "paypal"
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="pagamento"
                value="paypal"
                checked={metodoPagamento === "paypal"}
                onChange={() => setMetodoPagamento("paypal")}
                className="h-4 w-4 accent-blue-600"
              />
              <div className="flex flex-1 items-center gap-2">
                <Building className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-900">PayPal</span>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                metodoPagamento === "bonifico"
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="pagamento"
                value="bonifico"
                checked={metodoPagamento === "bonifico"}
                onChange={() => setMetodoPagamento("bonifico")}
                className="h-4 w-4 accent-blue-600"
              />
              <div className="flex flex-1 items-center gap-2">
                <Banknote className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-900">Bonifico bancario</span>
              </div>
            </label>
          </div>
        </div>

        {/* Riepilogo ordine */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Riepilogo ordine</h3>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex-1 text-slate-700">
                {nome} × {quantita}
              </span>
              <span className="font-semibold text-slate-900">
                €{subtotal.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Spedizione</span>
              <span className="text-slate-700">€{costoSpedizione.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-bold">
              <span className="text-slate-900">Totale</span>
              <span className="text-lg font-black text-slate-900">
                €{totale.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Errore di invio */}
        {errore && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errore}
          </div>
        )}

        {/* Procedi al pagamento */}
        <button
          type="button"
          onClick={procediAlPagamento}
          disabled={inviando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Invio ordine...
            </>
          ) : (
            "Procedi al pagamento"
          )}
        </button>
      </form>
    </div>
  );
}

function FormField({
  label,
  id,
  type = "text",
  required = false,
}: {
  label: string;
  id: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-700"
      >
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        required={required}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      />
    </div>
  );
}