"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Phone, MessageCircle, Calendar, Clock, Loader2, User } from "lucide-react";
import QuantitySelector from "./QuantitySelector";
import { creaOrdineViaApi, nuovaChiaveIdempotenza } from "@/lib/cliente/ordini-client";

type NegozioData = {
  nome: string;
  indirizzo: string | null;
  telefono: string | null;
  whatsapp: string | null;
};

type PrefillProfilo = {
  nome: string;
  cognome: string;
  telefono: string;
  autenticato: boolean;
};

export default function RitiroForm({
  prodottoId,
  nome,
  prezzo,
  imageUrl,
  varianteId,
  negozio,
  prefill,
}: {
  prodottoId: string;
  nome: string;
  prezzo: number;
  imageUrl: string;
  /** Variante selezionata (FASE E4): solo trasportata, validata dal server. */
  varianteId?: string | null;
  negozio: NegozioData | null;
  /** Precompilazione dal profilo cliente (autenticato). Default: vuoto. */
  prefill?: PrefillProfilo;
}) {
  const router = useRouter();
  const p = prefill ?? { nome: "", cognome: "", telefono: "", autenticato: false };
  const [quantita, setQuantita] = useState(1);
  const [data, setData] = useState("");
  const [fascia, setFascia] = useState("");
  const [note, setNote] = useState("");
  // Dati del cliente (obbligatori per identificare il ritirante) precompilati
  // dal profilo per SOLO questo ordine: il profilo resta invariato.
  const [nomeCliente, setNomeCliente] = useState(p.nome);
  const [cognomeCliente, setCognomeCliente] = useState(p.cognome);
  const [telefonoCliente, setTelefonoCliente] = useState(p.telefono);

  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // Errori per singolo campo: per il ritiro sono obbligatori nome, cognome,
  // data e fascia oraria. Il messaggio compare vicino al campo mancante.
  const [errori, setErrori] = useState<{
    nome?: string;
    cognome?: string;
    data?: string;
    fascia?: string;
  }>({});
  // Chiave di idempotenza: generata UNA volta per pagina → un doppio click
  // (o retry) non crea mai due ordini.
  const chiaveIdempotenza = useRef<string>(nuovaChiaveIdempotenza());

  const subtotal = prezzo * quantita;

  // Il ritiro è confermabile SOLO con tutti e 4 i campi obbligatori compilati.
  const ritiroCompleto =
    nomeCliente.trim() !== "" &&
    cognomeCliente.trim() !== "" &&
    data !== "" &&
    fascia !== "";

  const confermaRitiro = async () => {
    if (inviando) return; // anti doppio invio

    const nuoviErrori: { nome?: string; cognome?: string; data?: string; fascia?: string } = {};
    if (!nomeCliente.trim()) nuoviErrori.nome = "Inserisci il nome.";
    if (!cognomeCliente.trim()) nuoviErrori.cognome = "Inserisci il cognome.";
    if (!data) nuoviErrori.data = "Seleziona la data del ritiro.";
    if (!fascia) nuoviErrori.fascia = "Seleziona la fascia oraria.";
    if (Object.keys(nuoviErrori).length > 0) {
      setErrori(nuoviErrori);
      setErrore("Completa i campi obbligatori per il ritiro.");
      return;
    }
    setErrori({});

    setInviando(true);
    setErrore(null);
    try {
      const esito = await creaOrdineViaApi({
        idempotencyKey: chiaveIdempotenza.current,
        prodottoId,
        varianteId: varianteId ?? null,
        quantita,
        modalita: "ritiro",
        cliente: {
          nome: nomeCliente.trim(),
          cognome: cognomeCliente.trim(),
          telefono: telefonoCliente.trim() || null,
        },
        ritiro: {
          data: data || null,
          fascia: fascia || null,
        },
        note: note.trim() || null,
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

  const buildWhatsAppUrl = () => {
    if (!negozio?.whatsapp && !negozio?.telefono) return "#";
    const phone = (negozio.whatsapp || negozio.telefono || "").replace(/[\s\-().+]/g, "");
    const number = phone.startsWith("39") ? phone : `39${phone}`;
    const msg = encodeURIComponent(
      `Ciao! Vorrei ritirare "${nome}" x${quantita} il ${data || "da definire"} (${fascia || "orario da definire"}).${note ? ` Note: ${note}` : ""}`
    );
    return `https://wa.me/${number}?text=${msg}`;
  };

  const buildMapsUrl = () => {
    if (!negozio?.indirizzo) return "#";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negozio.indirizzo)}`;
  };

  const oggi = new Date().toISOString().split("T")[0];

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
          <p className="text-2xl font-black text-blue-700">
            €{prezzo.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Colonna destra: form ritiro */}
      <div className="space-y-4">
        {/* Quantità */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Quantità</h3>
          <div className="mt-3">
            <QuantitySelector value={quantita} onChange={setQuantita} />
          </div>
        </div>

        {/* Dati negozio */}
        {negozio && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">Punto vendita</h3>
            <p className="mt-1 text-sm font-semibold text-slate-900">{negozio.nome}</p>
            {negozio.indirizzo && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                {negozio.indirizzo}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {negozio.indirizzo && (
                <a
                  href={buildMapsUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
                >
                  <MapPin className="h-3 w-3" />
                  Google Maps
                </a>
              )}
              {negozio.telefono && (
                <a
                  href={`tel:${negozio.telefono}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
                >
                  <Phone className="h-3 w-3" />
                  {negozio.telefono}
                </a>
              )}
              {(negozio.whatsapp || negozio.telefono) && (
                <a
                  href={buildWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-whatsapp/40 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-whatsapp-dark transition hover:border-whatsapp hover:bg-whatsapp/10"
                >
                  <MessageCircle className="h-3 w-3" />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        )}

        {/* Dati del cliente per il ritiro */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <User className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Chi ritira
          </h3>
          {p.autenticato ? (
            <p className="mt-1 text-[11px] text-slate-400">
              Precompilati dal tuo profilo (puoi modificarli per questo ordine).
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Stai acquistando come ospite: non è richiesta la registrazione, indica solo chi
              ritira.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="nome-ritiro" className="block text-xs font-semibold text-slate-700">Nome *</label>
              <input
                id="nome-ritiro"
                type="text"
                value={nomeCliente}
                onChange={(e) => {
                  setNomeCliente(e.target.value);
                  setErrori((p) => ({ ...p, nome: undefined }));
                }}
                required
                aria-required="true"
                aria-invalid={!!errori.nome}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
              />
              {errori.nome && (
                <p className="mt-1 text-[11px] font-semibold text-blue-600">{errori.nome}</p>
              )}
            </div>
            <div>
              <label htmlFor="cognome-ritiro" className="block text-xs font-semibold text-slate-700">Cognome *</label>
              <input
                id="cognome-ritiro"
                type="text"
                value={cognomeCliente}
                onChange={(e) => {
                  setCognomeCliente(e.target.value);
                  setErrori((p) => ({ ...p, cognome: undefined }));
                }}
                required
                aria-required="true"
                aria-invalid={!!errori.cognome}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
              />
              {errori.cognome && (
                <p className="mt-1 text-[11px] font-semibold text-blue-600">{errori.cognome}</p>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="telefono-ritiro" className="block text-xs font-semibold text-slate-700">Telefono (facoltativo)</label>
            <input
              id="telefono-ritiro"
              type="tel"
              value={telefonoCliente}
              onChange={(e) => setTelefonoCliente(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
            />
          </div>
        </div>

        {/* Selezione data */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <Calendar className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Data ritiro *
          </h3>
          <input
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              setErrori((p) => ({ ...p, data: undefined }));
            }}
            min={oggi}
            required
            aria-required="true"
            aria-invalid={!!errori.data}
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
          />
          {errori.data && (
            <p className="mt-1 text-[11px] font-semibold text-blue-600">{errori.data}</p>
          )}
        </div>

        {/* Selezione fascia oraria */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <Clock className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Fascia oraria *
          </h3>
          <select
            value={fascia}
            onChange={(e) => {
              setFascia(e.target.value);
              setErrori((p) => ({ ...p, fascia: undefined }));
            }}
            required
            aria-required="true"
            aria-invalid={!!errori.fascia}
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
          >
            <option value="">Seleziona fascia oraria</option>
            <option value="09:00–10:00">09:00 – 10:00</option>
            <option value="10:00–11:00">10:00 – 11:00</option>
            <option value="11:00–12:00">11:00 – 12:00</option>
            <option value="12:00–13:00">12:00 – 13:00</option>
            <option value="14:00–15:00">14:00 – 15:00</option>
            <option value="15:00–16:00">15:00 – 16:00</option>
            <option value="16:00–17:00">16:00 – 17:00</option>
            <option value="17:00–18:00">17:00 – 18:00</option>
            <option value="18:00–19:00">18:00 – 19:00</option>
          </select>
          {errori.fascia && (
            <p className="mt-1 text-[11px] font-semibold text-blue-600">{errori.fascia}</p>
          )}
        </div>

        {/* Note cliente */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Note</h3>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Eventuali note per il ritiro..."
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100 placeholder:text-slate-400"
          />
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
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Totale</span>
              <span className="text-lg font-black text-slate-900">
                €{subtotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Errore di invio */}
        {errore && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
            {errore}
          </div>
        )}

        {/* Conferma ritiro */}
        {!ritiroCompleto && (
          <p className="text-[11px] leading-4 text-slate-500">
            Compila nome, cognome, data e fascia oraria per confermare il ritiro.
          </p>
        )}
        <button
          type="button"
          onClick={confermaRitiro}
          disabled={inviando || !ritiroCompleto}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-yellow-400 hover:text-blue-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Invio ordine...
            </>
          ) : (
            "Conferma ritiro"
          )}
        </button>
      </div>
    </div>
  );
}