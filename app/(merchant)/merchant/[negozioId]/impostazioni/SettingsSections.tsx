"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Store,
  ShoppingCart,
  Package,
  Megaphone,
  Settings2,
  ChevronDown,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getModuleComponent } from "@/lib/modules/registry";
import type { ModuloRegistro } from "@/types/negozio";
import SpedizionePaccoConfig from "@/components/merchant/SpedizionePaccoConfig";
import ModalitaVenditaConfig from "@/components/merchant/modules/ModalitaVenditaConfig";
import MetodiPagamentoCard from "@/components/merchant/MetodiPagamentoCard";
import type { ConfigPaccoSpedizione } from "@/lib/merchant/types";

type ComponenteModulo = React.ComponentType<{ storeId: string }> | null;

/** Elenco dei moduli CMS e del loro ordine (fonte condivisa con il wizard). */
const MODULI_REGISTRO: ModuloRegistro[] = [
  { id: "1", slug: "informazioni", nome: "Informazioni", descrizione: "Nome, categoria e descrizione", icona: "Building2", ordinamento: 1, attivo: true, default_in_template: true },
  { id: "2", slug: "immagini", nome: "Immagini", descrizione: "Logo, copertina e galleria", icona: "Image", ordinamento: 2, attivo: true, default_in_template: true },
  { id: "3", slug: "prodotti", nome: "Prodotti", descrizione: "Catalogo prodotti", icona: "Package", ordinamento: 3, attivo: true, default_in_template: true },
  { id: "4", slug: "servizi", nome: "Servizi", descrizione: "Servizi offerti", icona: "Sparkles", ordinamento: 4, attivo: true, default_in_template: true },
  { id: "5", slug: "offerte", nome: "Offerte", descrizione: "Offerte e promozioni", icona: "Tag", ordinamento: 5, attivo: true, default_in_template: true },
  { id: "6", slug: "eventi", nome: "Eventi", descrizione: "Eventi in programma", icona: "Calendar", ordinamento: 6, attivo: true, default_in_template: true },
  { id: "7", slug: "contatti", nome: "Contatti", descrizione: "Telefono, email, WhatsApp", icona: "Phone", ordinamento: 7, attivo: true, default_in_template: true },
  { id: "8", slug: "posizione", nome: "Posizione", descrizione: "Indirizzo e mappa", icona: "MapPin", ordinamento: 8, attivo: true, default_in_template: true },
  { id: "9", slug: "orari", nome: "Orari", descrizione: "Orari di apertura", icona: "Clock", ordinamento: 9, attivo: true, default_in_template: true },
  { id: "10", slug: "social", nome: "Social", descrizione: "Link social", icona: "MessageCircle", ordinamento: 10, attivo: true, default_in_template: true },
  { id: "11", slug: "seo", nome: "SEO", descrizione: "Meta tag e keywords", icona: "Search", ordinamento: 11, attivo: true, default_in_template: true },
  { id: "12", slug: "ai", nome: "AI", descrizione: "Dati assistente AI", icona: "Bot", ordinamento: 12, attivo: true, default_in_template: true },
  { id: "13", slug: "impostazioni", nome: "Impostazioni", descrizione: "Visibilità e preferenze", icona: "Settings", ordinamento: 13, attivo: true, default_in_template: true },
];

/** Moduli che non fanno parte del CMS ma sono sempre disponibili in Vendita. */
const MODULI_SPECIALI = new Set(["modalita-vendita", "spedizione", "pagamenti"]);

/** Fallback se il negozio non ha ancora `moduli_attivi` salvati. */
const MODULI_DEFAULT = [
  "informazioni", "immagini", "prodotti", "servizi", "offerte", "eventi",
  "contatti", "posizione", "orari", "social", "seo", "ai", "impostazioni",
];

type Sezione = {
  id: string;
  icona: LucideIcon;
  titolo: string;
  descrizione: string;
  riepilogo: string;
  moduli: string[];
};

const SEZIONI: Sezione[] = [
  {
    id: "negozio",
    icona: Store,
    titolo: "Il mio negozio",
    descrizione: "Dati, immagini e contatti del tuo negozio",
    riepilogo: "Informazioni · Immagini · Contatti · Posizione · Orari",
    moduli: ["informazioni", "immagini", "contatti", "posizione", "orari"],
  },
  {
    id: "vendita",
    icona: ShoppingCart,
    titolo: "Vendita",
    descrizione: "Come vendi e come i clienti ti pagano",
    riepilogo: "Modalità di vendita · Spedizione · Metodi di pagamento",
    moduli: ["modalita-vendita", "spedizione", "pagamenti"],
  },
  {
    id: "catalogo",
    icona: Package,
    titolo: "Catalogo e offerte",
    descrizione: "Prodotti, servizi e promozioni del negozio",
    riepilogo: "Prodotti · Servizi · Offerte · Eventi",
    moduli: ["prodotti", "servizi", "offerte", "eventi"],
  },
  {
    id: "visibilita",
    icona: Megaphone,
    titolo: "Visibilità e promozione",
    descrizione: "Social, SEO e assistente AI del negozio",
    riepilogo: "Social · SEO · Assistente AI",
    moduli: ["social", "seo", "ai"],
  },
  {
    id: "avanzate",
    icona: Settings2,
    titolo: "Impostazioni avanzate",
    descrizione: "Opzioni meno utilizzate: visibilità, in evidenza, colori e parole chiave",
    riepilogo: "Visibilità · In evidenza · Colori · Parole chiave",
    moduli: ["impostazioni"],
  },
];

/**
 * Pagina /impostazioni — 5 sezioni accordion (una sola aperta alla volta).
 * I moduli vengono montati alla prima apertura e poi restano montati
 * (solo nascosti): lo stato dei form non viene mai perso cambiando sezione.
 */
export default function SettingsSections({
  storeId,
  configPacco,
}: {
  storeId: string;
  configPacco: ConfigPaccoSpedizione;
}) {
  const [loading, setLoading] = useState(true);
  const [componenti, setComponenti] = useState<Record<string, ComponenteModulo>>({});
  const [moduliAttivi, setModuliAttivi] = useState<string[] | null>(null);
  const [aperta, setAperta] = useState<string>("negozio");
  const [aperteOnce, setAperteOnce] = useState<Record<string, boolean>>({ negozio: true });

  useEffect(() => {
    let attivo = true;
    async function load() {
      let attivi: string[] | null = null;
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/settings`);
        const json = await res.json();
        if (json.success) {
          attivi = json.data.settings.moduli_attivi ?? MODULI_DEFAULT;
        }
      } catch {
        // nessun settings disponibile: si usa il fallback
      }
      if (attivo) setModuliAttivi(attivi ?? MODULI_DEFAULT);

      const slugs = SEZIONI.flatMap((s) => s.moduli).filter(
        (slug) => !MODULI_SPECIALI.has(slug)
      );
      const mappa: Record<string, ComponenteModulo> = {};
      for (const slug of slugs) {
        mappa[slug] = await getModuleComponent(slug);
      }
      if (attivo) setComponenti(mappa);
      if (attivo) setLoading(false);
    }
    void load();
    return () => {
      attivo = false;
    };
  }, [storeId]);

  const sezioniVisibili = useMemo(() => {
    const attivi = moduliAttivi ?? MODULI_DEFAULT;
    return SEZIONI.map((s) => ({
      ...s,
      moduli: s.moduli.filter((slug) => MODULI_SPECIALI.has(slug) || attivi.includes(slug)),
    })).filter((s) => s.moduli.length > 0);
  }, [moduliAttivi]);

  const sezioneAperta = sezioniVisibili.some((s) => s.id === aperta)
    ? aperta
    : (sezioniVisibili[0]?.id ?? null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Caricamento moduli...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sezioniVisibili.map((s) => {
        const Icona = s.icona;
        const isAperta = sezioneAperta === s.id;
        // La sezione resta montata dopo la prima apertura: i form non perdono i dati.
        const resa = isAperta || aperteOnce[s.id] === true;

        return (
          <div
            key={s.id}
            className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => {
                setAperta((prev) => (prev === s.id ? "" : s.id));
                setAperteOnce((o) => ({ ...o, [s.id]: true }));
              }}
              aria-expanded={isAperta}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50/70 sm:gap-4 sm:px-5"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${
                  isAperta ? "bg-yellow-400 text-blue-900" : "bg-blue-50 text-blue-700"
                }`}
              >
                <Icona className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black tracking-tight text-slate-900">
                  {s.titolo}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                  {isAperta ? s.descrizione : s.riepilogo}
                </span>
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isAperta ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>

            <div className={isAperta ? "" : "hidden"}>
              {resa && (
                <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
                  {s.moduli.map((slug) => {
                    if (slug === "spedizione") {
                      return (
                        <SpedizionePaccoConfig
                          key="spedizione"
                          negozioId={storeId}
                          initialConfig={configPacco}
                        />
                      );
                    }
                    if (slug === "modalita-vendita") {
                      return <ModalitaVenditaConfig key="modalita-vendita" storeId={storeId} />;
                    }
                    if (slug === "pagamenti") {
                      return <MetodiPagamentoCard key="pagamenti" storeId={storeId} />;
                    }
                    const Componente = componenti[slug];
                    const nome = MODULI_REGISTRO.find((m) => m.slug === slug)?.nome ?? slug;
                    if (!Componente) {
                      return (
                        <div
                          key={slug}
                          className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm"
                        >
                          <p className="text-sm text-slate-400">
                            Modulo &ldquo;{nome}&rdquo; non disponibile
                          </p>
                        </div>
                      );
                    }
                    return <Componente key={slug} storeId={storeId} />;
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p>
          Ogni sezione si salva con il proprio pulsante &ldquo;Salva modifiche&rdquo;.
          Apri una sezione alla volta per non perdere il filo.
        </p>
      </div>
    </div>
  );
}
